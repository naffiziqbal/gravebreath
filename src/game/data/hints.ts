// One-time tips shown the first time each thing matters, and lines for the loading screen.
export const HINTS = {
  air: 'The bar at the top is your air. Breathing, striking matches and running all spend it.',
  match: 'A lit match burns air while it lasts, and running blows it out. Light only when you need to see.',
  phone: 'Your phone light lasts longer and burns no air, but its battery runs out for good.',
  survivor: 'Someone is buried alive nearby. Follow the knocking. Dig them out for matches, or leave them.',
  pocket: 'Cold air seeps in from above here. Stand in it to fill your lungs.',
  listener: 'Something down here hunts by sound. Walk, don\'t run.',
  breath: 'It is close. Hold your breath (the lungs button) and it cannot hear you breathe.',
  calm: 'Your heart is racing and you breathe faster. Stand still and hold the calm button.',
  hushmen: 'The Hushmen see by lantern light. Tall tombs hide you, low ones do not. Your own light gives you away.',
  tombs: 'A lantern is turning your way. Get a tall tomb between you and it.',
  surface: 'You can breathe again. The ledger lies open in the church porch.',
} as const;

export type HintId = keyof typeof HINTS;

export const LOADING_LINES = [
  'Beneath the town of Vael, the Hushmen bury the living. One breath a night.',
  'Every death adds a name to the ledger.',
  'The scratches on the lid were made by someone who lay here before you.',
  'Something in the catacombs listens for the sound of your heart.',
  'A match is light. A match is also air.',
  'The bells call the whole Order. Ring nothing.',
  'Low tombs will not hide you from a lantern.',
  'Hold your breath and the dark cannot hear you.',
  'Forty-one names. Tonight, one more.',
  'DON\'T WASTE IT.',
];
