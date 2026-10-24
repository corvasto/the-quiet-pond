export const RADIO_AUDIO_CONFIG = Object.freeze({
  enabled: true,
  // Distances are world units and also bound when proximity playback can begin.
  musicDistance: 5.5,
  // Volumes are linear audio gain values, not percentages.
  musicVolume: 0.82,
  announcementVolume: 0.92,
  // Crossfade and cooldown values use real seconds.
  crossfadeSeconds: 2.0,
  announcementDistance: 2.8,
  announcementCooldownSeconds: 70,
  captionSeconds: 5,
  music: Object.freeze({
    daytime: new URL('../../assets/audio/radio/radio-music-bright-morning-and-noon.mp3', import.meta.url).href,
    nightRain: new URL('../../assets/audio/radio/radio-music-night-sleep-or-raining.mp3', import.meta.url).href,
  }),
  static: Object.freeze({
    enabled: true,
    url: new URL('../../assets/audio/radio/radio-static.mp3', import.meta.url).href,
    distance: 3.4,
    volume: 0.055,
  }),
  announcements: Object.freeze({
    station: Object.freeze({
      file: 'radio-station-introduction.wav',
      text: Object.freeze({
        en: 'You are listening to the Pond evening service.',
        id: 'Anda sedang mendengarkan siaran sore Kolam.',
      }),
    }),
    morning: Object.freeze({
      file: 'radio-morning-message.wav',
      text: Object.freeze({
        en: 'The pond is quiet this morning. Small things are easier to find before the wind arrives.',
        id: 'Kolam terasa tenang pagi ini. Benda-benda kecil lebih mudah ditemukan sebelum angin datang.',
      }),
    }),
    rain: Object.freeze({
      file: 'radio-rain-warning.wav',
      text: Object.freeze({
        en: 'Rain is moving across the pond. If you are carrying something precious, find shelter beneath the roots.',
        id: 'Hujan bergerak melintasi. Jika membawa sesuatu yang berharga, berteduhlah di bawah akar atau tenda.',
      }),
    }),
    rainVariant: Object.freeze({
      file: 'radio-rain-variant.wav',
      text: Object.freeze({
        en: 'The clouds have opened over the eastern bank. The lamp will be useful after sunset.',
        id: 'Awan telah terbuka di tepi timur. Lampu akan berguna setelah matahari terbenam.',
      }),
    }),
    dusk: Object.freeze({
      file: 'radio-dusk-message.wav',
      text: Object.freeze({
        en: 'The light is fading. The old lamp will soon be warmer than the open ground.',
        id: 'Pemirsa, cahaya mulai redup. Lampu itu sebentar lagi akan terasa lebih hangat daripada tanah terbuka.',
      }),
    }),
    pond: Object.freeze({
      file: 'radio-pond-clue.wav',
      text: Object.freeze({
        en: 'Something has been placed near the water. Watch the surface carefully.',
        id: 'Sesuatu telah diletakkan dekat air. Perhatikan permukaannya dengan saksama.',
      }),
    }),
    seed: Object.freeze({
      file: 'radio-seed-clue.wav',
      text: Object.freeze({
        en: 'A seed was seen above the ground, somewhere among the branches.',
        id: 'Sebuah biji atau benih terlihat di atas tanah, di antara ranting-ranting.',
      }),
    }),
    closing: Object.freeze({
      file: 'radio-closing-message.wav',
      text: Object.freeze({
        en: 'That is all for now. The pond will continue listening.',
        id: 'Sekian untuk saat ini. Siaran Kolam akan terus mendengarkan.',
      }),
    }),
  }),
});
