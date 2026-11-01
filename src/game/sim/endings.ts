// How a run that reaches the ledger ends, decided by what the player has learned.
export type Ending = 'rain' | 'bells' | 'undertaker';

/** `story` is the epilogue, shown a passage at a time; `text` is the one-line summary on the end screen. */
export const ENDINGS: Record<Ending, { title: string; text: string; story: string[] }> = {
  rain: {
    title: 'The Rain',
    text: 'You escape into the rain. Nothing is resolved. Below Vael, a new name is entered in the ledger.',
    story: [
      'You run until the church is behind you and the lanterns are only sparks in the rain.',
      'Down the hill, Vael is asleep. There is no one awake to tell, and you would not know what to say.',
      'At the gate there is a boot print in the mud, and a single coin Cole dropped in his hurry. You keep the coin.',
      'By morning you are on the road out of the valley, with grave dirt under your nails and the taste of it in your mouth.',
      'Behind you, under the town, a name is written in fresh ink. Somewhere a lid is closing.',
      'The ledger is still open.',
    ],
  },
  bells: {
    title: 'The Bells',
    text: 'You ring every bell in Vael. The town reads the names and drags the Hushmen into the street. Nobody feeds the deep now, and the ground begins, softly, to breathe.',
    story: [
      'The first bell wakes the dogs. The second wakes the town.',
      'Lamps come on along every street in Vael. People stand in their doorways in the rain, listening to a sound nobody has heard in forty-one years.',
      'To the Hushmen the bells have only ever meant one thing: gather. So they come, up the chapel steps in their masks, lanterns raised, straight into the lamplight, and the whole town sees them.',
      'You read the names from the church steps. Elias. Ruth. Forty-one of them. Somewhere in the crowd a woman says her brother\'s name before you reach it.',
      'By morning the Hushmen sit unmasked in the cellar of the town hall, and they are only old men. The ledger burns in the square. Someone carves T.V. into the church door.',
      'Nobody goes down to feed the deep that night. Or the next.',
      'On the third night, every grave in Vael breathes out at once.',
    ],
  },
  undertaker: {
    title: 'The Undertaker',
    text: 'Your name is already in the ledger, in fresh ink. The Hushmen hold out a mask. Vael sleeps. Tomorrow night, you choose a name.',
    story: [
      'You close the book. Nobody stops you.',
      'They lead you back down: past the black water, past the tombs, past the bones. One of them lifts off his mask and settles it over your face. It is still warm.',
      'They teach you the words. Hush. Feed the deep. One breath.',
      'Up above, Vael sleeps. Its children grow up. Nobody in the town remembers to be afraid.',
      'Each night you open the ledger and choose a name. And each night you go down alone with a nail, and on the inside of the newest lid, where they will see it when they wake, you scratch the only kindness you are allowed:',
      'DON\'T WASTE IT.',
      'Forty-two.',
    ],
  },
};

/** Without the final page there is no choice to make: you just escape. */
export function endingChoices(clues: readonly string[]): Ending[] {
  return clues.includes('ledger-page-final') ? ['bells', 'undertaker'] : ['rain'];
}
