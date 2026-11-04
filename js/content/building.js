import { BUILDING_CONFIG } from '../config/building.js';

// Material IDs belong to items and inventory; visual IDs select procedural factories.
export const MATERIAL_DEFINITIONS = Object.freeze({
  leaf: Object.freeze({
    iconPaths: Object.freeze(['M12 54C8 28 27 8 56 8C56 37 39 57 12 54Z', 'M12 54L46 18M25 41L23 27M35 31L48 32']), id: 'leaf', labelKey: 'building.leaves', pickLabelKey: 'building.pickLeaf',
    carryStatusKey: 'building.carryLeaf', depositLabelKey: 'building.deposit',
    visual: 'leaf', spawnCount: BUILDING_CONFIG.leafCount,
    radius: BUILDING_CONFIG.leafRadius, carry: BUILDING_CONFIG.leafCarry,
  }),
  stick: Object.freeze({
    id: 'stick', iconPaths: Object.freeze(['M12 52L42 9L48 13L19 56Z', 'M31 29L18 19L21 15L35 23Z', 'M37 18L51 22L53 17L41 13Z']), labelKey: 'building.sticks', pickLabelKey: 'building.pickStick',
    carryStatusKey: 'building.carryStick', depositLabelKey: 'building.depositStick',
    visual: 'stick', spawnCount: BUILDING_CONFIG.stickCount, radius: BUILDING_CONFIG.stickRadius,
    carry: BUILDING_CONFIG.leafCarry,
  }),
});

export const BUILD_RECIPES = Object.freeze({
  'stick-frame': Object.freeze({
    id: 'stick-frame', labelKey: 'building.stickFrame', nameKey: 'building.frameName', visual: 'stickFrame',
    // Small illustrations mirror the procedural build's silhouette without loading models.
    iconShapes: Object.freeze([
      Object.freeze({ path: 'M16 78L34 16L40 18L23 80Z', fill: '#94704b', stroke: '#66472e' }),
      Object.freeze({ path: 'M56 18L62 16L80 78L73 80Z', fill: '#94704b', stroke: '#66472e' }),
      Object.freeze({ path: 'M18 18L78 18L78 25L18 25Z', fill: '#ad865c', stroke: '#66472e' }),
      Object.freeze({ path: 'M27 58L31 46M67 46L71 58M39 21L50 21', fill: 'none', stroke: '#66472e' }),
    ]),
    cost: Object.freeze({stick: 3}), radius: .4, clearance: .58,
  }),
  'leaf-shelter': Object.freeze({ id: 'leaf-shelter', hidden: true, labelKey: 'building.shelter', visual: 'shelter', cost: Object.freeze({leaf: 3}), radius: .4, clearance: .58 }),
  'leaf-bed': Object.freeze({
    id: 'leaf-bed', labelKey: 'building.build', nameKey: 'building.bedName', visual: 'bed',
    iconShapes: Object.freeze([
      Object.freeze({ path: 'M10 70C8 42 22 20 55 14C65 40 49 69 10 70Z', fill: '#82954a', stroke: '#526331' }),
      Object.freeze({ path: 'M27 81C20 52 40 28 82 25C87 56 65 80 27 81Z', fill: '#9dac56', stroke: '#526331' }),
      Object.freeze({ path: 'M11 70L49 24M28 80L74 34M43 65L41 51M55 54L69 55M28 49L26 36', fill: 'none', stroke: '#d6d59a' }),
    ]),
    cost: Object.freeze({ leaf: BUILDING_CONFIG.bedCost }),
    radius: BUILDING_CONFIG.bedRadius, clearance: BUILDING_CONFIG.bedClearance,
    rest: true,
  }),
});

export const LEAF_BED_RECIPE = BUILD_RECIPES['leaf-bed'];
