// What got you, and one thing to try next time: the end screen teaches instead of just ending. Pure, no rendering.
export type Fate = 'suffocated' | 'escaped' | 'taken';

const PLACE = ['', 'the coffin', 'the crypt', 'the catacombs', 'the necropolis', 'the graveyard'];

export function deathLesson(fate: Fate, layer: number, lit: boolean): { cause?: string; tip?: string } {
  if (fate === 'suffocated') {
    return layer <= 1
      ? { cause: 'Your air ran out inside the coffin.', tip: 'Light a match to see the lid, then hold PUSH. Waiting in the dark still costs breath.' }
      : { cause: `Your air ran out in ${PLACE[layer] ?? 'the dark'}.`, tip: 'Cold drafts are air pockets: stand in one to breathe. Running and lit matches burn air fastest; holding your breath uses the least.' };
  }
  if (fate === 'taken') {
    if (layer === 3) return { cause: 'The Listener found you.', tip: 'It hunts by sound. Walk instead of running, and hold your breath when it comes close.' };
    return lit
      ? { cause: 'A Hushman saw your light.', tip: 'A match or phone can be seen from far away. Move in the dark while they are near.' }
      : { cause: 'A Hushman\'s lantern found you.', tip: 'Low tombs do not hide you. Keep the tall ones between you and their lanterns.' };
  }
  return {};
}

