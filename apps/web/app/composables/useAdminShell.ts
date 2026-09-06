/**
 * The two preferences the CRM shell remembers, plus the nav map both the
 * sidebar and the command palette read from.
 *
 * Staff sit in this app all day on whatever monitor is at the desk, so the
 * choices are per-browser rather than per-account: a folded sidebar and a
 * compact table are about the screen in front of you, not about who you are.
 */

export interface AdminNavItem {
  to: string;
  label: string;
  icon: string;
  /**
   * Highlight on this exact path only. Needed where a sibling route lives
   * under the same prefix — `/admin/consultations` vs `.../board`.
   */
  exact?: boolean;
  /** Extra words the command palette matches on but the sidebar never shows. */
  keywords?: string;
}

export interface AdminNavGroup {
  /** Null for the primary block, which needs no heading. */
  title: string | null;
  items: AdminNavItem[];
  /** Secondary blocks start folded — progressive disclosure (1G-17). */
  collapsible?: boolean;
}

/**
 * Client-centric navigation (1G-17).
 *
 * The primary block is the daily loop: what needs attention, the enquiries
 * coming in, the people under contract, the work queue. Contracts, payments,
 * documents, applications and visa are no longer top-level destinations —
 * they live inside a client's workspace, and their cross-client queues sit in
 * "Үйл ажиллагаа" for the days someone works one function across everybody.
 */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    title: null,
    items: [
      { to: '/admin', label: 'Хяналтын самбар', icon: 'layout-dashboard', keywords: 'dashboard нүүр' },
      { to: '/admin/consultations', label: 'Зөвлөгөө хүсэлт', icon: 'message-square', exact: true, keywords: 'lead сэжим enquiry' },
      { to: '/admin/consultations/board', label: 'Борлуулалтын самбар', icon: 'kanban', keywords: 'kanban pipeline' },
      { to: '/admin/clients', label: 'Үйлчлүүлэгч', icon: 'users', keywords: 'client хэрэглэгч' },
      { to: '/admin/work-tasks', label: 'Ажил & хуваарь', icon: 'list-checks', keywords: 'task todo' },
    ],
  },
  {
    title: 'Лавлах',
    items: [
      { to: '/admin/universities', label: 'Сургууль', icon: 'school', keywords: 'university их сургууль' },
      { to: '/admin/programs', label: 'Хөтөлбөр, төлбөр', icon: 'book-open', exact: true, keywords: 'program tuition анги мэргэжил төлбөр сургалтын' },
      { to: '/admin/admissions', label: 'Элсэлт', icon: 'calendar-days', exact: true, keywords: 'intake admission хугацаа' },
      { to: '/admin/admissions/board', label: 'Элсэлтийн самбар', icon: 'calendar-clock', keywords: 'intake board' },
    ],
  },
  {
    title: 'Үйл ажиллагаа',
    collapsible: true,
    items: [
      { to: '/admin/cases', label: 'Үйлчилгээ', icon: 'folder', keywords: 'case' },
      { to: '/admin/documents', label: 'Материал шалгах', icon: 'file-check-2', keywords: 'document бичиг баримт' },
      { to: '/admin/applications', label: 'Мэдүүлэг', icon: 'graduation-cap', keywords: 'application' },
      { to: '/admin/visa', label: 'Виз', icon: 'plane', keywords: 'visa' },
      { to: '/admin/contracts', label: 'Гэрээ', icon: 'file-text', keywords: 'contract' },
      { to: '/admin/payments', label: 'Төлбөр', icon: 'credit-card', keywords: 'payment qpay' },
    ],
  },
  {
    title: 'Тайлан',
    collapsible: true,
    items: [{ to: '/admin/reports', label: 'Удирдлагын тайлан', icon: 'chart-column', keywords: 'report analytics' }],
  },
  {
    title: 'Тохиргоо',
    collapsible: true,
    items: [
      { to: '/admin/settings/pricing', label: 'Үнийн тохиргоо', icon: 'settings', keywords: 'price үнэ' },
      { to: '/admin/settings/contract-templates', label: 'Гэрээний загвар', icon: 'file-cog', keywords: 'contract template' },
      { to: '/admin/settings/document-templates', label: 'Материалын загвар', icon: 'folder-cog', keywords: 'document template' },
      { to: '/admin/settings/notifications', label: 'Мэдэгдлийн загвар', icon: 'bell-ring', keywords: 'notification email' },
      { to: '/admin/settings/admissions', label: 'Элсэлтийн тохиргоо', icon: 'calendar-cog', keywords: 'intake config' },
      { to: '/admin/settings/study-fields', label: 'Судлах чиглэл', icon: 'tags', keywords: 'study field мэргэжил чиглэл нэршил' },
      { to: '/admin/content', label: 'Контент', icon: 'newspaper', keywords: 'blog content' },
      { to: '/admin/settings/staff', label: 'Системийн хэрэглэгч', icon: 'user-cog', keywords: 'staff user role ажилтан эрх хэрэглэгч' },
    ],
  },
];

/** Things you *do*, as opposed to places you go. Offered by the palette. */
export const ADMIN_QUICK_ACTIONS: AdminNavItem[] = [
  { to: '/admin/clients/new', label: 'Шинэ үйлчлүүлэгч бүртгэх', icon: 'user-plus', keywords: 'new client add' },
  { to: '/admin/universities/new', label: 'Шинэ сургууль нэмэх', icon: 'plus', keywords: 'new university add' },
  { to: '/admin/admissions/new', label: 'Шинэ элсэлт нэмэх', icon: 'calendar-plus', keywords: 'new intake add' },
  { to: '/admin/programs/new', label: 'Шинэ хөтөлбөр нэмэх', icon: 'book-plus', keywords: 'new program add анги төлбөр' },
  { to: '/admin/universities/ranking', label: 'GKS рэйтинг тооцоолол', icon: 'trending-up', keywords: 'ranking score' },
];

export const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV.flatMap((group) => group.items);

const RAIL_KEY = 'gks:admin:rail';
const DENSITY_KEY = 'gks:admin:density';

export type AdminDensity = 'cosy' | 'compact';

export function useAdminShell() {
  const rail = useState<boolean>('admin:rail', () => false);
  const density = useState<AdminDensity>('admin:density', () => 'cosy');
  const paletteOpen = useState<boolean>('admin:palette', () => false);

  /**
   * Read on mount only. The server has no idea which monitor this is, so the
   * first paint uses the defaults and the preference lands a tick later —
   * cheaper than a cookie round trip for a purely cosmetic choice.
   */
  function restore() {
    if (import.meta.server) return;
    try {
      rail.value = localStorage.getItem(RAIL_KEY) === '1';
      density.value = localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'cosy';
    } catch {
      // Private-mode Safari throws on localStorage; the defaults are fine.
    }
  }

  function persist(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // See above.
    }
  }

  function toggleRail() {
    rail.value = !rail.value;
    persist(RAIL_KEY, rail.value ? '1' : '0');
  }

  function toggleDensity() {
    density.value = density.value === 'compact' ? 'cosy' : 'compact';
    persist(DENSITY_KEY, density.value);
  }

  return { rail, density, paletteOpen, restore, toggleRail, toggleDensity };
}

/** `/admin/clients/12` → the nav item it belongs to, for the breadcrumb. */
export function findAdminNavItem(path: string): AdminNavItem | undefined {
  const exact = ADMIN_NAV_ITEMS.find((item) => item.to === path);
  if (exact) return exact;
  return ADMIN_NAV_ITEMS
    .filter((item) => !item.exact && item.to !== '/admin' && path.startsWith(`${item.to}/`))
    // Longest prefix wins: `/admin/consultations/board` is not `/admin/consultations`.
    .sort((a, b) => b.to.length - a.to.length)[0];
}
