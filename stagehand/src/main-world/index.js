import * as adapter from './foundryAdapter.js';
import {speak,configureTTS} from './tts.js';
import {startStagehand} from './runtime.js';
if(!window.__stagehandInstalled){window.__stagehandInstalled=true;startStagehand({win:window,doc:document,adapter,speak,configureTTS});}
