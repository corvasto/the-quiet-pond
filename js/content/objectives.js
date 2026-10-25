function defineObjective(definition) {
  if (!definition?.id || !definition?.labelKey) {
    throw new TypeError('Objective definitions require id and labelKey.');
  }
  return Object.freeze({
    status: 'discovery',
    evaluator: null,
    availability: 'always',
    hintKey: null,
    target: null,
    radiusKey: null,
    managed: true,
    ...definition,
  });
}

export const GAME_OBJECTIVES = Object.freeze([
  defineObjective({
    id: 'seeds',
    labelKey: 'objective.seed.find',
    status: 'core',
    managed: false,
  }),
  defineObjective({
    id: 'offering',
    labelKey: 'objective.offering',
    status: 'core',
    managed: false,
  }),
  defineObjective({
    id: 'shelter',
    labelKey: 'objective.shelter',
    evaluator: 'shelter',
    availability: 'raining',
  }),
  defineObjective({
    id: 'lamp',
    labelKey: 'objective.lamp',
    evaluator: 'proximity3d',
    availability: 'night',
    target: 'lamp',
    radiusKey: 'lampRadius',
  }),
  defineObjective({
    id: 'reader',
    labelKey: 'objective.reader',
    hintKey: 'objective.reader.hint',
    evaluator: 'proximity3d',
    target: 'reader',
    radiusKey: 'readerBookRadius',
  }),
  defineObjective({
    id: 'companionAnt',
    labelKey: 'objective.companionAnt',
    evaluator: 'proximity3d',
    target: 'companionAnt',
    radiusKey: 'companionAntRadius',
  }),
  defineObjective({
    id: 'radio',
    labelKey: 'objective.radio',
    evaluator: 'proximity2d',
    target: 'radio',
    radiusKey: 'discoveryRadius',
  }),
  defineObjective({
    id: 'frog',
    labelKey: 'objective.frog',
    evaluator: 'proximity2d',
    target: 'frog',
    radiusKey: 'discoveryRadius',
  }),
  defineObjective({
    id: 'cockroach',
    labelKey: 'objective.cockroach',
    evaluator: 'proximity3d',
    target: 'cockroach',
    radiusKey: 'cockroachMeetRadius',
  }),
  defineObjective({
    id: 'cat',
    labelKey: 'objective.cat',
    evaluator: 'proximity3d',
    target: 'cat',
    radiusKey: 'catRadius',
  }),
  defineObjective({
    id: 'fireflies',
    labelKey: 'objective.fireflies',
    evaluator: 'pondSurface',
    availability: 'fireflyWindow',
  }),
  defineObjective({
    id: 'lollipop',
    labelKey: 'objective.lollipop',
    evaluator: 'proximity3d',
    target: 'lollipop',
    radiusKey: 'lollipopRadius',
  }),
]);

export const MANAGED_GAME_OBJECTIVES = Object.freeze(
  GAME_OBJECTIVES.filter((objective) => objective.managed),
);
