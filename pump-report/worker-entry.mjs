import legacy from './legacy-worker.mjs';
import {createPumpWorker} from './runtime/worker.mjs';
export default createPumpWorker(legacy);
