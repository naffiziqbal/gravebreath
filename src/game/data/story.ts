// The story the player is walked through: the job that buries them, and what to do on each layer of the way out.
export const JOB_CARDS = [
  'Vael. A town at the end of a bad road, and nobody on it you owe anything to.',
  'Cole says the Ashby tomb holds a ring worth more than the whole valley. No guards. An old lock. One night\'s work.',
  'He has been wrong before. But you are out of money, and he has never once left you behind.',
];

export const BURIAL_CARDS = [
  'A hand closes over your mouth. It smells of lamp oil.',
  'Cole will not look at you. Someone counts coins into his palm, slowly, so that you can hear each one.',
  'They write your name in a book while you watch. Then they lay you down, and the wood is very close.',
  'Hush. Feed the deep. One breath.',
  'The first spade of earth lands on the lid.',
];

export const OBJECTIVES = {
  jobWalk: 'The job · Find the Ashby tomb',
  jobDoor: 'The job · Force the tomb door',
  jobRing: 'The job · Take the ring',
  jobRun: 'The job · Get back to the gate',
  coffin: 'I · The coffin · Break the lid',
  crypt: 'II · The crypt · Find the stairs down',
  catacombs: 'III · The catacombs · Find the bone stair',
  necropolis: 'IV · The necropolis · Climb toward the bells',
  surface: 'V · The graveyard · Reach the ledger in the church porch',
} as const;
