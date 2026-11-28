import { useRef } from 'react'

/** Each write compares against the last version this editor actually saved. */
export function useIntakeAutosave<T>(initial: T, persist: (expected: T, next: T) => Promise<void>) {
  const confirmed = useRef<Promise<T>>(Promise.resolve(initial))

  function save(next: T) {
    const previous = confirmed.current
    const attempt = previous.then(async expected => {
      await persist(expected, next)
      return next
    })
    confirmed.current = attempt.catch(() => previous)
    return attempt
  }

  return { save, lastSaved: () => confirmed.current }
}
