/**
 * A clock that ticks once a second on the client.
 *
 * The first value is the server's, carried over in the payload under `key`, so
 * a countdown hydrates to the same digits it was rendered with instead of
 * flashing a mismatch; the ticking starts on mount.
 */
export function useNow(key: string) {
  const now = useState(key, () => Date.now());
  let timer: ReturnType<typeof setInterval> | undefined;

  onMounted(() => {
    now.value = Date.now();
    timer = setInterval(() => {
      now.value = Date.now();
    }, 1000);
  });
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
  });

  return now;
}
