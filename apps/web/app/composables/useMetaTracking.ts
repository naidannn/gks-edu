import type { MetaApi, MetaCustomData } from '~/plugins/meta-pixel.client';
import { newEventId } from '~/utils/meta-pixel';

/**
 * Access to the Meta pixel from a page (1A-38).
 *
 * The plugin is client-only, so on the server — and in a unit test, where no
 * plugin is installed — `$meta` is not there. Rather than making every call
 * site guard, this hands back the same no-op the plugin uses when tracking is
 * unconfigured.
 */
export function useMetaTracking(): MetaApi {
  const { $meta } = useNuxtApp() as unknown as { $meta?: MetaApi };
  return $meta ?? { track: () => '', trackPaired: () => undefined, trackCustom: () => '', newEventId };
}

export type { MetaCustomData };
