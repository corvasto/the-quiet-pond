const DEFAULT_LANGUAGE = 'en';
export const SUPPORTED_LANGUAGES = Object.freeze(['en', 'id']);

function defineMessage(translations) {
  return Object.freeze(translations);
}

export const MESSAGE_DEFINITIONS = Object.freeze({
  'ui.quality.title': defineMessage({ en: 'Graphics quality', id: 'Kualitas grafis' }),
  'ui.quality.auto': defineMessage({ en: 'Auto - device recommended', id: 'Otomatis - rekomendasi perangkat' }),
  'ui.quality.low': defineMessage({ en: 'Low - ~20 FPS, lowest load', id: 'Rendah - ~20 FPS, beban teringan' }),
  'ui.quality.mid': defineMessage({ en: 'Mid - ~20 FPS, balanced', id: 'Sedang - ~20 FPS, seimbang' }),
  'ui.quality.full': defineMessage({ en: 'Full - uncapped, best visuals', id: 'Penuh - tanpa batas, visual terbaik' }),
  'ui.quality.description': defineMessage({
    en: 'Full runs uncapped. Mid and Low target about 20 FPS. Applying saves progress and reloads the pond.',
    id: 'Penuh berjalan tanpa batas. Sedang dan Rendah menargetkan sekitar 20 FPS. Menerapkan pilihan akan menyimpan progres dan memuat ulang kolam.',
  }),
  'ui.quality.apply': defineMessage({ en: 'Apply changes and reload', id: 'Terapkan perubahan dan muat ulang' }),
  'ui.quality.error': defineMessage({ en: 'Could not save progress. Allow browser storage and try again.', id: 'Progres tidak dapat disimpan. Izinkan penyimpanan browser dan coba lagi.' }),
  'ui.settings.close': defineMessage({ en: 'Close settings', id: 'Tutup pengaturan' }),
  'ui.settings.interface': defineMessage({ en: 'Interface', id: 'Antarmuka' }),
  'ui.settings.audio': defineMessage({ en: 'Audio', id: 'Audio' }),
  'ui.settings.performance': defineMessage({ en: 'Performance', id: 'Performa' }),
  'ui.settings.world': defineMessage({ en: 'World', id: 'Dunia' }),
  'ui.audio.musicVolume': defineMessage({ en: 'Radio music volume', id: 'Volume musik radio' }),
  'ui.season.title': defineMessage({ en: 'Season', id: 'Musim' }),
  'ui.season.spring': defineMessage({ en: 'Spring', id: 'Musim semi' }),
  'ui.season.summer': defineMessage({ en: 'Summer', id: 'Musim panas' }),
  'ui.season.autumn': defineMessage({ en: 'Autumn', id: 'Musim gugur' }),
  'ui.season.description': defineMessage({ en: 'Changes apply after reload. Progress is saved.', id: 'Perubahan diterapkan setelah dimuat ulang. Progres akan disimpan.' }),
  'objective.seed.find': defineMessage({ en: 'Find an active seed.', id: 'Temukan benih yang aktif.' }),
  'objective.seed.carry': defineMessage({ en: 'Carry the seed to the quiet burrow.', id: 'Bawa benih ke liang yang tenang.' }),
  'objective.offering': defineMessage({ en: 'Offer the leaf to the pond.', id: 'Persembahkan daun ke kolam.' }),
  'objective.complete': defineMessage({ en: 'The pond has answered.', id: 'Kolam telah menjawab.' }),
  'objective.shelter': defineMessage({ en: 'Find shelter in the tent or burrow', id: 'Berteduhlah di tenda atau liang' }),
  'objective.lamp': defineMessage({
    en: 'Warm at the lamp during dusk or night',
    id: 'Menghangatlah di dekat lampu saat senja atau malam',
  }),
  'objective.reader': defineMessage({ en: 'Inspect the book', id: 'Periksa buku' }),
  'objective.reader.hint': defineMessage({
    en: "Climb from the reader's right foot.",
    id: 'Panjat dari kaki kanan pembaca.',
  }),
  'objective.companionAnt': defineMessage({ en: 'Meet another ant', id: 'Temui semut lain' }),
  'objective.radio': defineMessage({ en: 'Listen to the radio', id: 'Dengarkan radio' }),
  'objective.frog': defineMessage({ en: 'Visit the frog', id: 'Kunjungi katak' }),
  'objective.cat': defineMessage({ en: 'Visit the cat', id: 'Kunjungi kucing' }),
  'objective.cockroach': defineMessage({ en: 'Meet the cockroach', id: 'Temui kecoak' }),
  'objective.fireflies': defineMessage({
    en: 'Enjoy the fireflies on the pond at night',
    id: 'Nikmati kunang-kunang di kolam saat malam',
  }),
  'objective.lollipop': defineMessage({ en: 'Eat the lollipop', id: 'Makan lolipop' }),
  'interaction.allObjectives': defineMessage({
    en: 'The pond remembers every kindness. You can now fly as a bird.',
    id: 'Kolam mengingat setiap kebaikan. Kini kamu bisa terbang sebagai burung.',
  }),
  'ui.flyAsBird': defineMessage({ en: 'Fly as bird', id: 'Terbang jadi burung' }),
  'ui.birdPreparing': defineMessage({ en: 'Preparing bird...', id: 'Menyiapkan burung...' }),
  'prompt.bird.loadFailed': defineMessage({
    en: 'Bird flight could not be prepared. Please try again.',
    id: 'Penerbangan burung belum bisa disiapkan. Silakan coba lagi.',
  }),
  'debug.time.title': defineMessage({ en: 'Time preview', id: 'Pratinjau waktu' }),
  'debug.time.input': defineMessage({ en: 'Time of day', id: 'Waktu' }),
  'debug.time.apply': defineMessage({ en: 'Apply', id: 'Terapkan' }),
  'debug.time.freeze': defineMessage({ en: 'Freeze time', id: 'Bekukan waktu' }),
  'debug.time.reset': defineMessage({ en: 'Use game clock', id: 'Gunakan waktu permainan' }),
  'ui.playAsAnt': defineMessage({ en: 'Play as ant', id: 'Kembali jadi semut' }),
  'ui.birdView': defineMessage({ en: 'Bird view', id: 'Tampilan Burung' }),
  'ui.bird': defineMessage({ en: 'Bird', id: 'Burung' }),
  'ui.ant': defineMessage({ en: 'Ant', id: 'Semut' }),
  'ui.resetBirdCamera.aria': defineMessage({ en: 'Reset camera behind the bird (C)', id: 'Atur kamera di belakang burung (C)' }),
  'hint.rise': defineMessage({ en: 'rise', id: 'naik' }),
  'hint.descend': defineMessage({ en: 'descend', id: 'turun' }),
  'hint.touchBird': defineMessage({
    en: 'Joystick to fly · Look up or down to climb or descend',
    id: 'Joystick untuk terbang · Arahkan kamera ke atas atau bawah untuk naik atau turun',
  }),
  'prompt.bird.flight': defineMessage({
    en: 'The pond looks different from up here. Switch back to the ant whenever you like.',
    id: 'Kolam terlihat berbeda dari atas sini. Kamu bisa kembali menjadi semut kapan saja.',
  }),
  'prompt.bird.noRoom': defineMessage({
    en: 'There is not enough room to take flight here. Move the ant into an open area.',
    id: 'Tidak cukup ruang untuk terbang di sini. Pindahkan semut ke area terbuka.',
  }),
  'debug.bird.position': defineMessage({ en: 'Bird position', id: 'Posisi burung' }),
  'interaction.frog': defineMessage({ en: 'Hey buddy!', id: 'Hai, teman!' }),
  'interaction.cat': defineMessage({ en: 'Meow meow!', id: 'Meong meong!' }),
  'interaction.reader': defineMessage({ en: 'A window to the world.', id: 'Jendela dunia.' }),
  'ui.brand.subtitle': defineMessage({ en: 'A cozy exploration game', id: 'Game eksplorasi yang nyaman' }),
  'ui.scene.aria': defineMessage({ en: 'The Quiet Pond game', id: 'Game The Quiet Pond' }),
  'ui.title.aria': defineMessage({ en: 'Game title', id: 'Judul permainan' }),
  'ui.checklist.title': defineMessage({ en: 'The Quiet Pond checklist', id: 'Daftar tugas The Quiet Pond' }),
  'ui.checklist': defineMessage({ en: 'Checklist', id: 'Daftar tugas' }),
  'ui.progress.aria': defineMessage({ en: 'The Quiet Pond seed progress', id: 'Progres benih The Quiet Pond' }),
  'ui.objectives.aria': defineMessage({ en: 'Game objectives', id: 'Objektif permainan' }),
  'ui.time.aria': defineMessage({ en: 'Time of day', id: 'Waktu' }),
  'ui.time.valueAria': defineMessage({ en: 'Time of day: {time}', id: 'Waktu: {time}' }),
  'ui.controls.aria': defineMessage({ en: 'Game controls', id: 'Kontrol permainan' }),
  'ui.pause': defineMessage({ en: 'Pause', id: 'Jeda' }),
  'ui.settings': defineMessage({ en: 'Settings', id: 'Pengaturan' }),
  'ui.settings.description': defineMessage({ en: 'Adjust the pond to suit you.', id: 'Sesuaikan kolam agar cocok untukmu.' }),
  'ui.performance.aria': defineMessage({ en: 'Performance diagnostic', id: 'Diagnostik performa' }),
  'ui.performance.title': defineMessage({ en: 'Performance', id: 'Performa' }),
  'ui.performance.fps': defineMessage({ en: 'FPS', id: 'FPS' }),
  'ui.performance.setting': defineMessage({ en: 'Performance diagnostic', id: 'Diagnostik performa' }),
  'ui.performance.description': defineMessage({
    en: 'Show realtime FPS and warn when performance is low.',
    id: 'Tampilkan FPS secara langsung dan peringatkan saat performa rendah.',
  }),
  'ui.performance.warning': defineMessage({
    en: 'Low FPS - select Low graphics quality or close other apps.',
    id: 'FPS rendah - pilih kualitas grafis Rendah atau tutup aplikasi lain.',
  }),
  'ui.resume': defineMessage({ en: 'Resume', id: 'Lanjutkan' }),
  'ui.restart': defineMessage({ en: 'Restart', id: 'Mulai ulang' }),
  'ui.about.button': defineMessage({ en: 'About', id: 'Tentang' }),
  'ui.move': defineMessage({ en: 'Move', id: 'Gerak' }),
  'ui.resetCamera': defineMessage({ en: 'Reset view', id: 'Atur kamera' }),
  'ui.resetCamera.aria': defineMessage({ en: 'Reset camera behind the ant (C)', id: 'Atur kamera ke belakang semut (C)' }),
  'ui.explore': defineMessage({ en: 'Explore', id: 'Jelajah' }),
  'ui.antView': defineMessage({ en: 'Ant view', id: 'Tampilan Semut' }),
  'ui.language': defineMessage({ en: 'Language', id: 'Bahasa' }),
  'ui.touchControls.aria': defineMessage({ en: 'Touch game controls', id: 'Kontrol sentuh permainan' }),
  'ui.movementJoystick.aria': defineMessage({ en: 'Movement joystick', id: 'Joystick gerak' }),
  'ui.climbToggle': defineMessage({ en: 'Climb / Get down', id: 'Panjat / Turun' }),
  'ui.jumpClimb': defineMessage({ en: 'Jump / Climb', id: 'Lompat / Panjat' }),
  'ui.jumpClimb.aria': defineMessage({ en: 'B - Jump or climb', id: 'B - Lompat atau panjat' }),
  'ui.holdRun': defineMessage({ en: 'Hold to run', id: 'Tahan untuk berlari' }),
  'ui.holdRun.aria': defineMessage({ en: 'A - Hold to run', id: 'A - Tahan untuk berlari' }),
  'ui.complete.title': defineMessage({ en: 'The pond has answered', id: 'Kolam telah menjawab' }),
  'ui.complete.description': defineMessage({
    en: 'The seeds are home, and the offering is remembered.',
    id: 'Benih-benih telah pulang, dan persembahan itu dikenang.',
  }),
  'ui.loading': defineMessage({ en: 'Preparing a small world', id: 'Menyiapkan dunia kecil' }),
  'ui.loading.progress': defineMessage({ en: 'Loading progress', id: 'Progres pemuatan' }),
  'ui.loading.qualityTip': defineMessage({
    en: 'If the game feels choppy, open Settings and choose a lower graphics quality.',
    id: 'Jika permainan terasa tersendat, buka Pengaturan dan pilih kualitas grafis yang lebih rendah.',
  }),
  'ui.error.title': defineMessage({ en: 'The Quiet Pond could not start.', id: 'The Quiet Pond tidak dapat dimulai.' }),
  'ui.error.gameTitle': defineMessage({ en: 'The Quiet Pond could not start.', id: 'The Quiet Pond tidak dapat dimulai.' }),
  'ui.error.fallback': defineMessage({
    en: 'Open the browser console for details and check that the project is served over HTTP.',
    id: 'Buka konsol browser untuk detail dan pastikan proyek disajikan melalui HTTP.',
  }),
  'ui.pause.keys.or': defineMessage({ en: 'or', id: 'atau' }),
  'ui.pause.keys.resume': defineMessage({ en: 'resumes play.', id: 'melanjutkan permainan.' }),
  'ui.save.slot': defineMessage({ en: 'Pond #{number}', id: 'Pond #{number}' }),
  'hint.moveRoam': defineMessage({ en: 'move and roam', id: 'bergerak dan menjelajah' }),
  'hint.hold': defineMessage({ en: 'hold', id: 'tahan' }),
  'hint.run': defineMessage({ en: 'run', id: 'lari' }),
  'hint.climbDown': defineMessage({ en: 'climb or get down', id: 'memanjat atau turun' }),
  'hint.debug': defineMessage({ en: 'debug', id: 'debug' }),
  'hint.fly': defineMessage({ en: 'fly', id: 'terbang' }),
  'hint.weather': defineMessage({ en: 'rain', id: 'hujan' }),
  'hint.radioMusic': defineMessage({ en: 'radio music', id: 'musik radio' }),
  'hint.testVoice': defineMessage({ en: 'test voice', id: 'uji suara' }),
  'hint.explore': defineMessage({ en: 'explore', id: 'jelajah' }),
  'hint.dragLook': defineMessage({ en: 'Drag to look', id: 'Seret untuk melihat' }),
  'hint.dragOrbit': defineMessage({ en: 'Drag to orbit', id: 'Seret untuk mengorbit' }),
  'hint.rightDragPan': defineMessage({ en: 'Right-drag to pan', id: 'Seret klik kanan untuk menggeser' }),
  'hint.wheelZoom': defineMessage({ en: 'Scroll to zoom', id: 'Gulir untuk zoom' }),
  'hint.touchLook': defineMessage({ en: 'Drag the scene to look · Pinch to zoom · ↶ Reset view', id: 'Seret layar untuk melihat · Cubit untuk zoom · ↶ Atur kamera' }),
  'hint.touchExplore': defineMessage({ en: 'One finger: pan · Two fingers: orbit / zoom', id: 'Satu jari: geser · Dua jari: putar / zoom' }),
  'hint.leftDragMoveAnt': defineMessage({ en: 'left drag move ant', id: 'seret kiri untuk memindahkan semut' }),
  'prompt.explore.finishClimb': defineMessage({ en: 'Finish the climb before exploring.', id: 'Selesaikan panjatan sebelum menjelajah.' }),
  'prompt.climb.closer': defineMessage({
    en: "Move the ant's head closer to a climbable surface, then use the climb action.",
    id: 'Dekatkan kepala semut ke permukaan yang dapat dipanjat, lalu gunakan aksi panjat.',
  }),
  'prompt.climb.radioEdge': defineMessage({
    en: 'Move toward an outside edge of the radio, then use the climb action again.',
    id: 'Bergeraklah ke tepi luar radio, lalu gunakan aksi panjat lagi.',
  }),
  'prompt.climb.radioSupport': defineMessage({
    en: 'On the rock below the radio. Use the climb action to climb onto it.',
    id: 'Di batu di bawah radio. Gunakan aksi panjat untuk naik ke radio.',
  }),
  'prompt.climb.near': defineMessage({
    en: 'Head near {landmark}, then use the climb action.',
    id: 'Dekati {landmark}, lalu gunakan aksi panjat.',
  }),
  'prompt.climb.surface': defineMessage({
    en: 'On {landmark}. Move to roam, or use the climb action to get down.',
    id: 'Di {landmark}. Bergeraklah untuk menjelajah, atau gunakan aksi panjat untuk turun.',
  }),
  'prompt.climb.cannotStand': defineMessage({
    en: 'Could not stand on {landmark}.',
    id: 'Tidak dapat berdiri di {landmark}.',
  }),
  'prompt.climb.lostSurface': defineMessage({
    en: 'Lost the roaming surface on {landmark}.',
    id: 'Kehilangan permukaan jelajah di {landmark}.',
  }),
  'debug.flight.enabled': defineMessage({
    en: 'Debug flight enabled: WASD move, Space rise, Ctrl descend.',
    id: 'Terbang debug aktif: WASD bergerak, Spasi naik, Ctrl turun.',
  }),
  'debug.flight.disabled': defineMessage({ en: 'Debug flight disabled.', id: 'Terbang debug nonaktif.' }),
  'debug.coordinates.title': defineMessage({ en: 'Ant position', id: 'Posisi semut' }),
  'debug.camera.position': defineMessage({ en: 'Camera position', id: 'Posisi kamera' }),
  'debug.camera.target': defineMessage({ en: 'Camera target', id: 'Target kamera' }),
  'debug.camera.rotation': defineMessage({ en: 'Camera orientation (degrees)', id: 'Orientasi kamera (derajat)' }),
  'debug.coordinates.aria': defineMessage({
    en: 'Live ant and camera values',
    id: 'Nilai semut dan kamera saat ini',
  }),
  'debug.radio.music': defineMessage({ en: 'Radio music: {mode}.', id: 'Musik radio: {mode}.' }),
  'debug.radio.voice': defineMessage({
    en: 'Testing radio announcement: {result}.',
    id: 'Menguji pengumuman radio: {result}.',
  }),
  'debug.weather': defineMessage({ en: 'Debug weather: {phase}.', id: 'Cuaca debug: {phase}.' }),
  'ui.about.title': defineMessage({ en: 'About this game', id: 'Tentang game ini' }),
  'ui.about.close': defineMessage({ en: 'Close About', id: 'Tutup Tentang' }),
  'ui.version': defineMessage({ en: 'Version {version}', id: 'Versi {version}' }),
  'ui.about.description': defineMessage({
    en: 'Explore a small, living pond, discover active seeds, and help guide them home. Take your time - the quiet world is full of gentle details and hidden routines.',
    id: 'Jelajahi kolam kecil yang hidup, temukan benih-benih aktif, dan bantu mengantarkannya pulang. Nikmati waktumu - dunia yang tenang ini penuh detail lembut dan rutinitas tersembunyi.',
  }),
  'ui.about.support.title': defineMessage({ en: 'Support the project', id: 'Dukung proyek ini' }),
  'ui.about.support.description': defineMessage({
    en: 'Enjoying the pond? You can support this hobby project with a small tip.',
    id: 'Suka game ini? Kamu bisa mendukung proyek hobi ini dengan tip kecil.',
  }),
  'ui.about.support.indonesia': defineMessage({
    en: 'Support on Trakteer (QRIS/GoPay)',
    id: 'Dukung via Trakteer (QRIS/GoPay)',
  }),
  'ui.about.support.international': defineMessage({
    en: 'Support on Ko-fi',
    id: 'Dukung via Ko-fi',
  }),
  'ui.about.attribution.title': defineMessage({ en: 'Attributions', id: 'Atribusi' }),
  'ui.about.attribution.models': defineMessage({
    en: '3D model credits',
    id: 'Kredit model 3D',
  }),
  'ui.about.attribution.music': defineMessage({
    en: 'Music: sourced from the YouTube Audio Library in YouTube Studio.',
    id: 'Musik: bersumber dari YouTube Audio Library di YouTube Studio.',
  }),
  'ui.about.attribution.voices': defineMessage({
    en: 'Voices: generated with Google AI Studio.',
    id: 'Suara: dibuat dengan Google AI Studio.',
  }),
  'ui.about.attribution.original': defineMessage({
    en: 'Procedural world, game design, writing, and code: created for The Quiet Pond.',
    id: 'Dunia prosedural, desain game, penulisan, dan kode: dibuat untuk The Quiet Pond.',
  }),
  'ui.about.source': defineMessage({
    en: 'Source code on GitHub',
    id: 'Kode sumber di GitHub',
  }),
  'ui.close': defineMessage({ en: 'Close', id: 'Tutup' }),
  'ui.paused': defineMessage({ en: 'Paused', id: 'Dijeda' }),
  'ui.paused.description': defineMessage({
    en: 'Take a moment. The Pond will wait.',
    id: 'Beristirahatlah sejenak. Kolam akan menunggu.',
  }),
  'ui.sound.title': defineMessage({ en: 'Soft chimes', id: 'Lonceng lembut' }),
  'ui.sound.description': defineMessage({
    en: 'Soft chimes for seed pickup and burrow delivery.',
    id: 'Bunyi lembut saat mengambil benih dan mengantarkannya ke liang.',
  }),
  'ui.save.title': defineMessage({ en: 'Save games', id: 'Simpan permainan' }),
  'ui.save.new': defineMessage({ en: 'New game', id: 'Permainan baru' }),
  'ui.save.load': defineMessage({ en: 'Load', id: 'Muat' }),
  'ui.save.delete': defineMessage({ en: 'Delete', id: 'Hapus' }),
  'ui.save.empty': defineMessage({ en: 'Empty', id: 'Kosong' }),
  'ui.save.current': defineMessage({ en: 'Current save', id: 'Simpanan saat ini' }),
  'ui.save.start': defineMessage({ en: 'Start here', id: 'Mulai di sini' }),
  'ui.save.full': defineMessage({
    en: 'All save slots are in use. Delete a save before starting a new game.',
    id: 'Semua slot simpanan telah digunakan. Hapus simpanan sebelum memulai permainan baru.',
  }),
  'ui.save.confirmDelete': defineMessage({
    en: 'Delete this save? This cannot be undone.',
    id: 'Hapus simpanan ini? Tindakan ini tidak dapat dibatalkan.',
  }),
  'ui.save.lastPlayed': defineMessage({ en: 'Last played', id: 'Terakhir dimainkan' }),
  'status.offering.complete': defineMessage({ en: 'Pond offering complete', id: 'Persembahan ke kolam selesai' }),
  'status.paused': defineMessage({ en: 'Paused.', id: 'Dijeda.' }),
  'prompt.burrow.close': defineMessage({ en: 'The burrow is close.', id: 'Liangnya sudah dekat.' }),
  'prompt.offering.return': defineMessage({
    en: 'Return to the burrow for the pond offering.',
    id: 'Kembali ke liang untuk persembahan ke kolam.',
  }),
  'prompt.offering.pondClose': defineMessage({
    en: 'The pond is close. Offer the leaf at the water.',
    id: 'Kolam sudah dekat. Persembahkan daun di air.',
  }),
  'prompt.offering.carry': defineMessage({ en: 'Carry the leaf to the pond.', id: 'Bawa daun ke kolam.' }),
  'sound.objectives': defineMessage({
    en: 'Soft chimes for completed objectives and seed progress.',
    id: 'Lonceng lembut untuk objektif yang selesai dan progres biji.',
  }),
});

function compileMessageCatalog() {
  const catalogs = SUPPORTED_LANGUAGES.map((language) => {
    const entries = Object.entries(MESSAGE_DEFINITIONS).map(([key, translations]) => {
      const message = translations[language];
      if (typeof message !== 'string') {
        throw new Error(`Message ${key} is missing the ${language} translation.`);
      }
      return [key, message];
    });
    return [language, Object.freeze(Object.fromEntries(entries))];
  });
  return Object.freeze(Object.fromEntries(catalogs));
}

export const MESSAGE_CATALOG = compileMessageCatalog();

const SUPPORTED_LANGUAGE_SET = new Set(SUPPORTED_LANGUAGES);

const ENGLISH_TO_KEY = Object.freeze(Object.fromEntries(
  Object.entries(MESSAGE_CATALOG.en).map(([key, message]) => [message, key]),
));

export function normalizeLanguage(language) {
  return SUPPORTED_LANGUAGE_SET.has(language) ? language : DEFAULT_LANGUAGE;
}

function interpolateMessage(template, parameters = {}) {
  return String(template ?? '').replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => (
    Object.hasOwn(parameters, key) ? String(parameters[key]) : match
  ));
}

export function translateMessage(keyOrEnglish, language = DEFAULT_LANGUAGE, parameters = {}) {
  const source = String(keyOrEnglish ?? '');
  const key = MESSAGE_CATALOG.en[source] ? source : ENGLISH_TO_KEY[source];
  const catalog = MESSAGE_CATALOG[normalizeLanguage(language)];
  const template = key ? (catalog[key] ?? MESSAGE_CATALOG.en[key]) : source;
  return interpolateMessage(template, parameters);
}
