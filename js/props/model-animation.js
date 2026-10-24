import * as THREE from 'three';

export function resolveAnimationClip(animations, selector = 0) {
  const clips = Array.isArray(animations) ? animations : [];
  if (Number.isInteger(selector)) return clips[selector] ?? null;
  if (typeof selector !== 'string' || selector.length === 0) return clips[0] ?? null;
  const exact = clips.find((clip) => clip.name === selector);
  if (exact) return exact;
  const normalized = selector.toLowerCase();
  return clips.find((clip) => clip.name.toLowerCase().includes(normalized)) ?? null;
}

export function createFrameAnimationClip(sourceClip, {
  name,
  frames,
  framesPerSecond = 30,
  removeTracks = [],
} = {}) {
  if (!sourceClip || !Array.isArray(frames) || frames.length !== 2) return null;
  const fps = Math.max(1, Number(framesPerSecond) || 30);
  const maximumEndFrame = Math.max(1, Math.ceil(sourceClip.duration * fps));
  const startFrame = THREE.MathUtils.clamp(
    Math.round(Number(frames[0]) || 0),
    0,
    maximumEndFrame - 1,
  );
  const endFrame = THREE.MathUtils.clamp(
    Math.round(Number(frames[1]) || maximumEndFrame),
    startFrame + 1,
    maximumEndFrame,
  );
  const clip = THREE.AnimationUtils.subclip(
    sourceClip,
    `${sourceClip.name} ${name ?? 'range'} ${startFrame}-${endFrame}`,
    startFrame,
    endFrame,
    fps,
  );
  const removed = new Set(removeTracks);
  clip.tracks = clip.tracks.filter((track) => !removed.has(track.name));
  clip.resetDuration();
  return clip;
}

export function cloneAnimationClip(sourceClip, {
  name = sourceClip?.name,
  removeTracks = [],
} = {}) {
  if (!sourceClip) return null;
  const clip = sourceClip.clone();
  clip.name = name;
  const removed = new Set(removeTracks);
  clip.tracks = clip.tracks.filter((track) => !removed.has(track.name));
  clip.resetDuration();
  return clip;
}

export function createConfiguredAnimationClip(animations, recipe = {}, name = 'configured') {
  const sourceClip = resolveAnimationClip(animations, recipe.clip ?? 0);
  if (!sourceClip) return null;
  if (Array.isArray(recipe.frames)) {
    return createFrameAnimationClip(sourceClip, {
      name,
      frames: recipe.frames,
      framesPerSecond: recipe.framesPerSecond,
      removeTracks: recipe.removeTracks,
    });
  }
  return cloneAnimationClip(sourceClip, {
    name: `${sourceClip.name} ${name}`,
    removeTracks: recipe.removeTracks,
  });
}
