// The story is told through clues found across runs. 40 are planned; the first act is written here.
// `act` gates when a clue can spawn: act 1 = first runs, act 2 = after 5 clues, act 3 = after 15.

export type ClueKind = 'lid' | 'gravestone' | 'ledger' | 'survivor' | 'item';

export type Clue = {
  id: string;
  kind: ClueKind;
  act: 1 | 2 | 3;
  title: string;
  text: string;
};

export const CLUES: Clue[] = [
  { id: 'lid-dont-waste', kind: 'lid', act: 1, title: 'Scratched lid', text: 'DON\'T WASTE IT.\n\nThe letters are gouged deep, as if someone had all the time in the world, and no air.' },
  { id: 'lid-count', kind: 'lid', act: 1, title: 'Tally marks', text: 'Rows of tally marks cover the inside of the lid. Forty-one. The last one is unfinished.' },
  { id: 'ledger-page-1', kind: 'ledger', act: 1, title: 'Ledger page, torn', text: 'Fed the deep: Elias Marr, cooper. One breath given.\nThe ground was quiet that winter.' },
  { id: 'ledger-page-2', kind: 'ledger', act: 1, title: 'Ledger page, water-stained', text: 'Fed the deep: Ruth Calloway. Struggled. Two of us held the lid.\nVael sleeps.' },
  { id: 'stone-hushmen', kind: 'gravestone', act: 1, title: 'Unmarked stone', text: 'No name. Only a carved hand pressed over a mouth.\nThe mark of the Hushmen.' },
  { id: 'item-watch', kind: 'item', act: 1, title: 'Stopped pocket watch', text: 'Engraved: "To T.V., for thirty years of service to the Order."\nIt stopped at 3:12.' },
  { id: 'survivor-ada', kind: 'survivor', act: 1, title: 'Ada\'s words', text: '"They come at three. Always three. They don\'t bury the dead here, they bury the ones who might talk."' },
  { id: 'item-postcard', kind: 'item', act: 2, title: 'Postcard from Vael', text: '"Greetings from Vael, where nobody ever leaves!"\nOn the back, in pencil: "I was wrong to join. I\'m going to stop them."' },
  { id: 'ledger-page-3', kind: 'ledger', act: 2, title: 'Ledger page, careful hand', text: 'Each victim chosen from the ledger. Each name entered before the digging.\nThe ink is always fresh.' },
  { id: 'survivor-jonah', kind: 'survivor', act: 2, title: 'Jonah\'s words', text: '"Someone scratched a warning in my coffin too. Same words. Same handwriting. Who is doing that, from down here?"' },
  { id: 'stone-undertaker', kind: 'gravestone', act: 2, title: 'Broken headstone', text: 'HERE LIES THE LAST UNDERTAKER OF THE ORDER\nwho would not bury the living.\nThe date has been chiselled away.' },
  // the catacombs: what hunts there, and who left the warnings
  { id: 'cat-blind', kind: 'ledger', act: 1, title: 'Note, pinned with a bone', text: 'It has no eyes. It hears your heart if you let it race.\nDo not run. Do not speak. Hold your breath when it is near.\n— T.V.' },
  { id: 'cat-names', kind: 'gravestone', act: 1, title: 'Names on the femurs', text: 'Every bone in this wall has a name scratched into it. Some of the names are from the ledger.\nOne bone is blank, and waiting.' },
  { id: 'cat-map', kind: 'item', act: 1, title: 'Map on a scrap of shroud', text: 'A rough map in charcoal. Tunnels, dead ends, and one mark: a stair made of bones.\n"The way up the Order never filled in."' },
  { id: 'cat-feed', kind: 'gravestone', act: 2, title: 'Carving above an arch', text: 'WHAT WE FEED STAYS BELOW.\nWHAT WE STARVE COMES UP.' },
  { id: 'ledger-page-final', kind: 'ledger', act: 3, title: 'The first page', text: 'Before Elias, before Ruth, one name in a different ink: the undertaker\'s own.\nThe handwriting matches the scratches on every lid.' },
];

export function cluesForAct(act: number, found: readonly string[]): Clue[] {
  return CLUES.filter((c) => c.act <= act && !found.includes(c.id));
}

/** Story act unlocked by how many clues the ledger already holds. */
export function actFor(foundCount: number): 1 | 2 | 3 {
  if (foundCount >= 15) return 3;
  if (foundCount >= 5) return 2;
  return 1;
}
