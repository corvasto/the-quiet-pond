import * as THREE from 'three';
import { getHabitatArea } from '../config/index.js';

const interactionMethods = {
    updatePondPointer(event) {
      const bounds = this.renderer.domElement.getBoundingClientRect();
      this.pondStonePointer.set(
        (event.clientX - bounds.left) / Math.max(1, bounds.width) * 2 - 1,
        -(event.clientY - bounds.top) / Math.max(1, bounds.height) * 2 + 1,
      );
      this.pondStoneRaycaster.setFromCamera(this.pondStonePointer, this.camera);
    },

    setupExploreTouchControls() {
      const canvas = this.renderer.domElement;
      const pointers = new Map();
      let previousPinchDistance = null;

      const updateTouchMode = (active) => {
        this.exploreTouchMode = Boolean(active);
        // Explore uses one-finger camera panning while the joystick remains separate.
        this.controls.touches.ONE = active ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
        this.controls.touches.TWO = active ? THREE.TOUCH.DOLLY_ROTATE : THREE.TOUCH.DOLLY_PAN;
        if (!active) {
          pointers.clear();
          previousPinchDistance = null;
        }
      };

      this.setExploreTouchMode = updateTouchMode;

      const pinchDistance = () => {
        const points = [...pointers.values()];
        if (points.length < 2) return null;
        return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      };

      this.listen(canvas, 'pointerdown', (event) => {
        if (event.pointerType !== 'touch' || !this.exploreTouchMode) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        previousPinchDistance = pinchDistance();
      });
      this.listen(canvas, 'pointermove', (event) => {
        if (event.pointerType !== 'touch' || !this.exploreTouchMode || !pointers.has(event.pointerId)) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const distance = pinchDistance();
        previousPinchDistance = distance;
      });
      const finishTouch = (event) => {
        if (event.pointerType !== 'touch') return;
        pointers.delete(event.pointerId);
        previousPinchDistance = pinchDistance();
      };
      this.listen(canvas, 'pointerup', finishTouch, true);
      this.listen(canvas, 'pointercancel', finishTouch, true);
      updateTouchMode(false);
    },

    setupPondStoneInteraction() {
      const canvas = this.renderer.domElement;
      this.listen(canvas, 'pointerdown', (event) => {
        if (
          event.button !== 0
          || !this.draggablePondStone?.parent
          || !this.activePondWater
        ) return;
        this.updatePondPointer(event);
        const hit = this.pondStoneRaycaster.intersectObject(this.draggablePondStone, false)[0];
        if (!hit) return;
        event.preventDefault();
        event.stopPropagation();
        this.draggedPondStone = this.draggablePondStone;
        this.draggedPondStone.userData.sinking = false;
        this.draggedPondStone.userData.settledInPond = false;
        this.draggedPondStone.userData.sinkVelocity = 0;
        this.controls.enabled = false;
        canvas.setPointerCapture?.(event.pointerId);
        const worldPosition = this.draggedPondStone.getWorldPosition(this.pondDragPoint);
        this.pondDragPlane.setFromNormalAndCoplanarPoint(
          new THREE.Vector3(0, 1, 0),
          worldPosition,
        );
        this.lastStoneRipplePoint.set(worldPosition.x, worldPosition.z);
        this.stoneWasInPond = this.ground?.containsPond?.(
          worldPosition.x,
          worldPosition.z,
          -0.03,
        ) ?? false;
        canvas.style.cursor = 'grabbing';
      }, true);

      this.listen(canvas, 'pointermove', (event) => {
        this.updatePondPointer(event);
        if (!this.draggedPondStone) {
          const hovering = this.draggablePondStone?.parent
            && this.pondStoneRaycaster.intersectObject(this.draggablePondStone, false).length > 0;
          canvas.style.cursor = hovering ? 'grab' : '';
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (!this.pondStoneRaycaster.ray.intersectPlane(this.pondDragPlane, this.pondDragPoint)) return;
        const habitat = getHabitatArea(this.settings.area);
        const limit = habitat.detailSize * 0.5 - 0.55;
        this.pondDragPoint.x = THREE.MathUtils.clamp(this.pondDragPoint.x, -limit, limit);
        this.pondDragPoint.z = THREE.MathUtils.clamp(this.pondDragPoint.z, -limit, limit);
        const insidePond = this.ground?.containsPond?.(
          this.pondDragPoint.x,
          this.pondDragPoint.z,
          -0.03,
        ) ?? false;
        const radius = this.draggedPondStone.userData.radius ?? 0.36;
        this.pondDragPoint.y = insidePond
          ? this.activePondWater.getSurfaceHeight(this.pondDragPoint.x, this.pondDragPoint.z)
            + radius * 0.48
          : this.ground.heightAt(this.pondDragPoint.x, this.pondDragPoint.z) + radius * 0.26;
        this.pondDragLocalPoint.copy(this.pondDragPoint);
        this.draggedPondStone.parent.worldToLocal(this.pondDragLocalPoint);
        this.draggedPondStone.position.copy(this.pondDragLocalPoint);
        this.draggedPondStone.userData.sinking = false;
        this.draggedPondStone.userData.settledInPond = false;

        const rippleDistance = this.lastStoneRipplePoint.distanceTo(
          this.pondRippleProbe.set(this.pondDragPoint.x, this.pondDragPoint.z),
        );
        if (insidePond && (rippleDistance >= 0.16 || !this.stoneWasInPond)) {
          this.activePondWater.addRipple(
            this.pondDragPoint.x,
            this.pondDragPoint.z,
            this.stoneWasInPond ? 0.012 : 0.045,
            this.stoneWasInPond ? 0.2 : 0.34,
          );
          this.lastStoneRipplePoint.set(this.pondDragPoint.x, this.pondDragPoint.z);
        }
        this.stoneWasInPond = insidePond;
      }, true);

      const finishDrag = (event) => {
        if (!this.draggedPondStone) return;
        event.stopPropagation();
        const stone = this.draggedPondStone;
        const worldPosition = stone.getWorldPosition(this.pondDragPoint);
        const insidePond = this.ground?.containsPond?.(
          worldPosition.x,
          worldPosition.z,
          -0.03,
        ) ?? false;
        const radius = stone.userData.radius ?? 0.36;
        if (insidePond) {
          this.activePondWater?.addRipple(worldPosition.x, worldPosition.z, 0.07, 0.42);
          this.activePondWater?.createSplash(worldPosition.x, worldPosition.z, 1);
          stone.userData.sinking = true;
          stone.userData.settledInPond = false;
          stone.userData.sinkVelocity = -0.14;
          stone.userData.sinkSpinX = 0.58 + Math.abs(Math.sin(worldPosition.z)) * 0.28;
          stone.userData.sinkSpinZ = 0.34 + Math.abs(Math.cos(worldPosition.x)) * 0.22;
        } else {
          stone.userData.sinking = false;
          stone.userData.settledInPond = false;
          stone.userData.sinkVelocity = 0;
          stone.position.y = this.ground.heightAt(worldPosition.x, worldPosition.z) + radius * 0.26;
        }
        this.draggedPondStone = null;
        this.controls.enabled = true;
        if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        canvas.style.cursor = 'grab';
      };
      this.listen(canvas, 'pointerup', finishDrag, true);
      this.listen(canvas, 'pointercancel', finishDrag, true);
    },

    updatePondStone(delta) {
      const stone = this.draggablePondStone;
      if (
        !stone?.parent
        || stone === this.draggedPondStone
        || !stone.userData.sinking
        || !this.activePondWater
        || !this.ground
      ) return;
      const worldPosition = stone.getWorldPosition(this.pondDragPoint);
      const radius = stone.userData.radius ?? 0.36;
      const bedY = this.ground.heightAt(worldPosition.x, worldPosition.z) + radius * 0.26;
      const step = Math.min(delta, 0.05);
      stone.userData.sinkVelocity = Math.max(
        -1.35,
        (stone.userData.sinkVelocity ?? -0.14) - step * 1.85,
      );
      stone.position.y = Math.max(
        bedY,
        stone.position.y + stone.userData.sinkVelocity * step,
      );
      stone.rotation.x += step * (stone.userData.sinkSpinX ?? 0.68);
      stone.rotation.z += step * (stone.userData.sinkSpinZ ?? 0.42);
      if (stone.position.y <= bedY + 0.0001) {
        stone.position.y = bedY;
        stone.userData.sinking = false;
        stone.userData.settledInPond = true;
        stone.userData.sinkVelocity = 0;
      }
    },
};

export function installPondInteractionMethods(PondApp) {
  Object.entries(interactionMethods).forEach(([name, method]) => {
    Object.defineProperty(PondApp.prototype, name, {
      configurable: true,
      writable: true,
      value: method,
    });
  });
}
