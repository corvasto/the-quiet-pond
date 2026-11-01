import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PondRadioAudio } from '../js/game/radio-audio.js';
import { AntClimbing } from '../js/game/ant-climbing.js';
import { PondGameSession } from '../js/game/game-session.js';

const climbing = new AntClimbing({});
climbing.phase = 'surface';
climbing.route = { id: 'radio' };
climbing.surfaceRole = 'model';
assert.equal(climbing.isOnRadio(), true);
climbing.surfaceRole = 'support';
assert.equal(climbing.isOnRadio(), false, 'The supporting rock is not the radio.');
climbing.surfaceRole = 'model';
climbing.route.id = 'tent';
assert.equal(climbing.isOnRadio(), false);
climbing.route.id = 'radio';
const session = new PondGameSession(null);
session.app = {};
session.climbing = climbing;
session.isFlightEnabled = () => false;
assert.equal(session.canAdjustRadio(), true);
session.exploreActive = true;
assert.equal(session.canAdjustRadio(), false);
session.exploreActive = false;
session.paused = true;
assert.equal(session.canAdjustRadio(), false);

const radio = new PondRadioAudio({}, { musicVolume: 0.8, audioListener: {} });
let volume = 0;
const music = {
  buffer: {}, isPlaying: false,
  setVolume(value) { volume = value; },
  getVolume() { return volume; },
  play() { this.isPlaying = true; },
  stop() { this.isPlaying = false; },
};
radio.music.set('daytime', music);
radio.unlocked = true;
radio.voiceEnabled = false;
radio.update({ delta: 2, hour: 12, antPosition: new THREE.Vector3() });
const original = volume;
assert.ok(original > 0);
radio.setMusicVolume(0.4);
assert.ok(Math.abs(volume - original / 2) < 1e-10, 'Slider updates playback immediately without a frame.');
radio.setMusicVolume(0);
assert.equal(volume, 0);
radio.setMusicVolume(0.8);
assert.ok(Math.abs(volume - original) < 1e-10, 'Raising volume after mute restores the current mix.');
radio.setMusicVolume(5);
assert.equal(radio.musicVolume, 1, 'Volume remains clamped.');
let voiceVolume = null;
const voice = { setVolume(value) { voiceVolume = value; }, play() {} };
radio.announcementAudio = voice;
radio.announcementLevel = 1;
radio.setMusicVolume(0.5);
assert.equal(voiceVolume, radio.config.announcementVolume * 0.5, 'The current voice responds immediately.');
radio.setMusicVolume(0);
assert.equal(voiceVolume, 0, 'The slider also mutes the current voice.');
radio.announcementAudio = null;
radio.announcements.set('station', { buffer: {}, text: 'Hello' });
radio.createRadioAudio = ({ volume: initialVolume }) => {
  voiceVolume = initialVolume;
  return voice;
};
radio.setMusicVolume(0.25);
radio.playAnnouncement('station');
assert.equal(voiceVolume, radio.config.announcementVolume * 0.25, 'New voices start at the chosen volume.');
radio.announcementAudio = null;
radio.setMusicVolume(0.8);
radio.update({ delta: 0.25, hour: 12, antPosition: new THREE.Vector3(6, 0, 0) });
assert.ok(music.isPlaying && volume > 0, 'Music keeps playing while it fades beyond its range.');
const fadingVolume = volume;
radio.update({ delta: 0.25, hour: 12, antPosition: new THREE.Vector3(6, 0, 0) });
assert.ok(volume < fadingVolume && music.isPlaying, 'Music fades gradually outside the boundary.');
for (let i = 0; i < 100; i += 1) radio.update({ delta: 0.25, hour: 12, antPosition: new THREE.Vector3(6, 0, 0) });
assert.equal(music.isPlaying, false, 'Music stops after fading out.');
radio.update({ delta: 2, hour: 12, antPosition: new THREE.Vector3() });
radio.announcementAudio = voice;
radio.announcementLevel = 1;
radio.update({ delta: 0.25, hour: 12, antPosition: new THREE.Vector3(6, 0, 0) });
assert.ok(voiceVolume > 0 && voiceVolume < radio.config.announcementVolume * radio.musicVolume, 'Voice fades gradually with distance.');
radio.stopMusic();
radio.setMusicVolume(0.5);
assert.equal(volume, 0, 'Stopped music stays silent.');
console.log('Radio volume checks passed: immediate changes, mute recovery, clamping, and stopped playback.');
