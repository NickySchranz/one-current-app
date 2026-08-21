/**
 * What a fire leaves behind. When a thread is burned away it is removed from
 * the app completely — the lesson is the one thing carried out, kept on its
 * own, deliberately without the thread's name.
 */
export type Lesson = {
  id: string;
  text: string;
  /** YYYY-MM-DD — the day of the fire. */
  on: string;
};
