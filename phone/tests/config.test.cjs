const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const appConfig = JSON.parse(read('app.json')).expo;
const eas = JSON.parse(read('eas.json'));
const database = read('src/database.ts');
const app = read('App.tsx');

assert.equal(appConfig.ios.bundleIdentifier, 'com.joseffyu.studyaboard');
assert.equal(appConfig.android.package, 'com.joseffyu.studyaboard');
assert.equal(eas.build.preview.android.buildType, 'apk');
assert.equal(eas.build.production.android.buildType, 'app-bundle');
assert.ok(fs.existsSync(path.join(root, appConfig.icon)));
assert.ok(fs.existsSync(path.join(root, 'assets/card-flip.wav')));

for (const table of ['users', 'entries', 'calendar_settings', 'holidays', 'service_tasks', 'lessons']) {
  assert.match(database, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
}

for (const feature of ['AuthScreen', 'HomeScreen', 'ScheduleScreen', 'ServicesScreen', 'AiScreen', 'ProfileSheet']) {
  assert.match(app, new RegExp(`function ${feature}`));
}

console.log('phone configuration and feature contract: OK');
