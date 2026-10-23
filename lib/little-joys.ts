import { publishedJournal, publishedLittleJoys } from './publication.ts';
import { demoMessages, demoCoupons } from './demo-data.ts';
export const LITTLE_JOYS_KEY = publishedJournal ? 'yuni-little-joys-v1' : 'love-journal-demo-little-joys-v1';

export type Message = {
  id: string;
  content: string;
  signature: string;
  pinned: boolean;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export const couponIcons = [
  'massage', 'film', 'truce', 'tea', 'hug', 'time',
  'comfort', 'praise', 'wish', 'date', 'surprise', 'restart',
] as const;
export type CouponIcon = (typeof couponIcons)[number];

export type Coupon = {
  id: string;
  title: string;
  description: string;
  quantity: number; // Remaining; kept for compatibility with existing local data.
  initialQuantity: number;
  icon: CouponIcon;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export type LittleJoys = {
  version: 1;
  messages: Message[];
  coupons: Coupon[];
};

const defaultMessages = demoMessages;
const defaultCoupons = demoCoupons;

export function createDefaultLittleJoys(timestamp = Date.now()): LittleJoys {
  return {
    version: 1,
    messages: defaultMessages.map((content, index) => ({
      id: `message_${String(index + 1).padStart(2, '0')}`,
      content,
      signature: '',
      pinned: false,
      enabled: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
    coupons: defaultCoupons.map((coupon, index) => ({
      id: `coupon_${String(index + 1).padStart(2, '0')}`,
      ...coupon,
      initialQuantity: coupon.quantity,
      enabled: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  };
}

export function validateLittleJoys(value: unknown): LittleJoys {
  const data = value as LittleJoys;
  if (!data || data.version !== 1 || !Array.isArray(data.messages) || !Array.isArray(data.coupons))
    throw Error('小确幸的本地内容格式不正确');
  const ids = new Set<string>();
  for (const message of data.messages) {
    if (!message || typeof message.id !== 'string' || !message.id || ids.has(message.id) ||
      typeof message.content !== 'string' || !message.content.trim() || message.content.length > 1000 ||
      typeof message.signature !== 'string' || message.signature.length > 40 ||
      typeof message.pinned !== 'boolean' || typeof message.enabled !== 'boolean' ||
      !Number.isFinite(message.createdAt) || !Number.isFinite(message.updatedAt))
      throw Error('小确幸中存在无效留言');
    ids.add(message.id);
  }
  for (const coupon of data.coupons) {
    const initialQuantity = coupon?.initialQuantity ?? coupon?.quantity; // V1 coupons had only quantity.
    if (!coupon || typeof coupon.id !== 'string' || !coupon.id || ids.has(coupon.id) ||
      typeof coupon.title !== 'string' || !coupon.title.trim() || coupon.title.length > 80 ||
      typeof coupon.description !== 'string' || coupon.description.length > 500 ||
      !Number.isInteger(coupon.quantity) || coupon.quantity < 0 || coupon.quantity > 999 ||
      !Number.isInteger(initialQuantity) || initialQuantity < coupon.quantity || initialQuantity > 999 ||
      !couponIcons.includes(coupon.icon) || typeof coupon.enabled !== 'boolean' ||
      !Number.isFinite(coupon.createdAt) || !Number.isFinite(coupon.updatedAt))
      throw Error('小确幸中存在无效兑换券');
    ids.add(coupon.id);
  }
  return { ...data, coupons: data.coupons.map((coupon) => ({
    ...coupon, initialQuantity: coupon.initialQuantity ?? coupon.quantity,
  })) };
}

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

export function loadLittleJoys(storage: KeyValueStore, timestamp = Date.now()): LittleJoys {
  const saved = storage.getItem(LITTLE_JOYS_KEY);
  if (saved !== null) {
    try {
      const parsed = JSON.parse(saved);
      const normalized = validateLittleJoys(parsed);
      if (parsed.coupons.some((coupon: Coupon) => coupon.initialQuantity === undefined))
        storage.setItem(LITTLE_JOYS_KEY, JSON.stringify(normalized));
      return normalized;
    }
    catch { throw Error('小确幸的本地内容无法读取；为保护原数据，未重新初始化。'); }
  }
  if (publishedJournal) throw Error('发布内容尚未载入，请刷新后重试。');
  const defaults = createDefaultLittleJoys(timestamp);
  storage.setItem(LITTLE_JOYS_KEY, JSON.stringify(defaults));
  return defaults;
}

export function saveLittleJoys(storage: KeyValueStore, data: LittleJoys): LittleJoys {
  const valid = validateLittleJoys(data);
  storage.setItem(LITTLE_JOYS_KEY, JSON.stringify(valid));
  return valid;
}

export function redeemCoupon(data: LittleJoys, id: string, timestamp = Date.now()): LittleJoys {
  const coupon = data.coupons.find((item) => item.id === id);
  if (!coupon || !coupon.enabled) throw Error('这张券暂时不可兑换。');
  if (coupon.quantity < 1) throw Error('这张券已经兑完了。');
  return {
    ...data,
    coupons: data.coupons.map((item) => item.id === id
      ? { ...item, quantity: item.quantity - 1, updatedAt: timestamp }
      : item),
  };
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function visibleMessages(messages: Message[], day: string): Message[] {
  return messages.filter((message) => message.enabled).sort((a, b) =>
    Number(b.pinned) - Number(a.pinned) ||
    (a.pinned && b.pinned ? a.createdAt - b.createdAt : hash(day + a.id) - hash(day + b.id)) ||
    a.id.localeCompare(b.id));
}

// Fetch only when this browser has no local content. Existing edits always win.
export async function readLittleJoys(storage: KeyValueStore): Promise<LittleJoys> {
  if (!publishedJournal || storage.getItem(LITTLE_JOYS_KEY) !== null) return loadLittleJoys(storage);
  const value = await publishedLittleJoys();
  const seed = validateLittleJoys(value ?? { version: 1, messages: [], coupons: [] });
  if (storage.getItem(LITTLE_JOYS_KEY) !== null) return loadLittleJoys(storage);
  return saveLittleJoys(storage, seed);
}
