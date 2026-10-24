// Scene configuration and compiled model settings, initialized once at startup.
export { APP_VERSION } from './app.js';
export { PERFORMANCE } from './quality.js';
export {
  ANT_LOCATOR,
  ANT_NIGHT_LIGHT,
  CAMERA_VIEWS,
  DEFAULTS,
  DIORAMA,
  ENVIRONMENT,
  SEASONS,
  TIME_OF_DAY,
  getHabitatArea,
} from './scene.js';

import { PERFORMANCE } from './quality.js';
import { createSceneProps } from '../content/assets.js';

export const SCENE_PROPS = createSceneProps(PERFORMANCE);
