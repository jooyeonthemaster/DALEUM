/* ============================================================
   DALEUM 도메인 타입 — DB 스키마(supabase/migrations)와 1:1
   ============================================================ */

export type Role = "customer" | "admin";
export type ProductStatus = "draft" | "active" | "sold_out" | "hidden";
export type StorageType = "room" | "chilled" | "frozen";
export type OrderStatus =
  | "pending"
  | "paid"
  | "preparing"
  | "shipped"
  | "delivered"
  | "confirmed"
  | "cancelled"
  | "refund_requested"
  | "refunded";
export type PaymentStatus =
  | "ready"
  | "paid"
  | "cancelled"
  | "partial_refunded"
  | "refunded"
  | "failed";
export type ShipmentStatus = "ready" | "in_transit" | "delivered";
export type DiscountType = "rate" | "fixed";

export interface Profile {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  role: Role;
  marketing_opt_in: boolean;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface Address {
  id: string;
  user_id: string;
  label: string;
  recipient: string;
  phone: string;
  postcode: string;
  address1: string;
  address2: string | null;
  is_default: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  category_id: string | null;
  /** 패키지 인쇄 소비자 브랜드 (마틴조 / 바비지요 / 밥애쏙 / 칼로리시즌 …) — 0003 마이그레이션 */
  brand?: string | null;
  /** 공급 라인: 자체 / 수다락 / 곤약닷컴 — 관리자 식별용, 고객 화면에는 노출하지 않는다 */
  supplier?: string | null;
  description: string | null;
  /**
   * 상세페이지 문서 v2 (lib/detail-doc-v2.ts 의 DetailDoc). 0007 마이그레이션.
   * 이것이 있으면 진실이고, description 은 그것의 레거시 마크다운 미러다.
   * 없으면(=새 편집기로 저장한 적 없는 상품) 고객 화면은 기존 렌더 경로를 그대로 탄다.
   */
  description_doc?: unknown | null;
  story: string | null;
  price: number;
  compare_at_price: number | null;
  cost_price: number | null;
  sku: string | null;
  stock: number;
  low_stock_threshold: number;
  status: ProductStatus;
  storage_type: StorageType;
  origin: string | null;
  weight: string | null;
  units_per_pack: number;
  badges: string[];
  nutrition: Record<string, string | number>;
  specs: Record<string, string | number>;
  tags: string[];
  is_featured: boolean;
  sort_order: number;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  url: string;
  alt: string | null;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  price_delta: number;
  stock: number;
  sku: string | null;
  is_active: boolean;
  sort_order: number;
}

/** 목록/카드 표시용 조인 결과 */
export interface ProductWithImages extends Product {
  product_images: ProductImage[];
  categories?: Pick<Category, "id" | "slug" | "name"> | null;
  product_variants?: ProductVariant[];
}

/**
 * 카드/목록 표시에 필요한 만큼만 담은 상품 행.
 *
 * 목록 쿼리가 `select("*")` 였을 때 응답의 58%가 카드에서 전혀 쓰이지 않는
 * 본문 컬럼(description·story·specs·nutrition)이었다. 여기에 더해 원가(cost_price)와
 * 공급 라인(supplier)은 고객 화면에 나갈 이유가 없는 내부 정보라 함께 제외한다.
 *
 * ProductWithImages 에서 필드를 뺀 형태이므로 ProductWithImages 값은 그대로 대입된다
 * — 상세 페이지처럼 전체 행을 가진 곳은 수정 없이 같은 카드 컴포넌트를 쓸 수 있다.
 */
export type ProductCardRow = Omit<
  ProductWithImages,
  | "description"
  | "description_doc"
  | "story"
  | "specs"
  | "nutrition"
  | "cost_price"
  | "supplier"
  | "product_variants"
>;

/** VIP 가격이 해석된 카드 행 */
export interface PricedProductCard extends ProductCardRow {
  effective_price: number;
  vip_applied: boolean;
}

export interface InventoryLog {
  id: number;
  product_id: string;
  variant_id: string | null;
  delta: number;
  reason: "order" | "cancel" | "restock" | "adjust" | "initial";
  ref_order_id: string | null;
  memo: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CartItem {
  id: string;
  cart_id: string;
  product_id: string;
  variant_id: string | null;
  qty: number;
  created_at: string;
}

export interface OrdererInfo {
  name: string;
  phone: string;
  email?: string;
}

export interface RecipientInfo {
  name: string;
  phone: string;
  postcode: string;
  address1: string;
  address2?: string;
  memo?: string;
}

export interface Order {
  id: string;
  order_no: string;
  user_id: string | null;
  status: OrderStatus;
  subtotal: number;
  discount_total: number;
  shipping_fee: number;
  total: number;
  vip_campaign_id: string | null;
  vip_code: string | null;
  coupon_id: string | null;
  coupon_discount: number;
  orderer: OrdererInfo;
  recipient: RecipientInfo;
  paid_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  admin_memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  name_snapshot: string;
  option_snapshot: string | null;
  image_url: string | null;
  unit_price: number;
  original_price: number;
  qty: number;
  created_at: string;
}

export interface OrderWithItems extends Order {
  order_items: OrderItem[];
  payments?: Payment[];
  shipments?: Shipment[];
}

export interface Payment {
  id: string;
  order_id: string;
  provider: string;
  payment_key: string | null;
  method: string | null;
  amount: number;
  status: PaymentStatus;
  requested_at: string;
  approved_at: string | null;
  receipt_url: string | null;
  card_info: Record<string, unknown> | null;
  failure: Record<string, unknown> | null;
}

export interface Shipment {
  id: string;
  order_id: string;
  carrier_code: string;
  carrier_name: string;
  tracking_no: string;
  status: ShipmentStatus;
  shipped_at: string | null;
  delivered_at: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

/* ---------- VIP ---------- */

export interface VipGroup {
  id: string;
  name: string;
  description: string | null;
  discount_rate: number;
  is_active: boolean;
  created_at: string;
}

export interface VipMember {
  id: string;
  user_id: string;
  group_id: string;
  note: string | null;
  created_at: string;
  profiles?: Pick<Profile, "id" | "email" | "name" | "phone">;
  vip_groups?: VipGroup;
}

export interface VipProductPrice {
  id: string;
  group_id: string | null;
  user_id: string | null;
  product_id: string;
  custom_price: number | null;
  discount_rate: number | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface VipAccessCode {
  id: string;
  code: string;
  group_id: string;
  label: string | null;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface VipCampaign {
  id: string;
  token: string;
  title: string;
  message: string | null;
  group_id: string | null;
  target_user_id: string | null;
  require_code: string | null;
  hero_image_url: string | null;
  expires_at: string | null;
  is_active: boolean;
  view_count: number;
  created_by: string | null;
  created_at: string;
}

export interface VipCampaignItem {
  id: string;
  campaign_id: string;
  product_id: string;
  custom_price: number;
  sort_order: number;
  products?: ProductWithImages;
}

/* ---------- 마케팅/콘텐츠 ---------- */

export interface Coupon {
  id: string;
  code: string;
  name: string;
  discount_type: DiscountType;
  value: number;
  min_order: number;
  max_discount: number | null;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  used_count: number;
  per_user_limit: number;
  is_active: boolean;
  created_at: string;
}

export interface Popup {
  id: string;
  title: string;
  image_url: string | null;
  content: string | null;
  link_url: string | null;
  position: "center" | "bottom-left" | "bottom";
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  placement: "hero" | "strip" | "mid" | "footer";
  text_theme: "dark" | "light";
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface Review {
  id: string;
  product_id: string;
  user_id: string;
  order_item_id: string | null;
  rating: number;
  content: string;
  image_urls: string[];
  is_hidden: boolean;
  admin_reply: string | null;
  admin_replied_at: string | null;
  created_at: string;
  profiles?: Pick<Profile, "name">;
}

export interface Notice {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  is_active: boolean;
  created_at: string;
}

export interface ShippingSettings {
  base_fee: number;
  free_threshold: number;
  island_extra: number;
}

/* ---------- 업소용·OEM 견적 문의 (0004) ---------- */

export type BulkInquiryStatus = "new" | "contacted" | "quoted" | "closed" | "spam";
export type BulkInquiryPurpose = "oem" | "raw_material" | "wholesale" | "sample" | "etc";

export interface BulkInquiry {
  id: string;
  company: string;
  contact_name: string;
  phone: string;
  email: string;
  biz_no: string | null;
  purpose: BulkInquiryPurpose | null;
  /** 관심 품목 — products.slug */
  product_slugs: string[];
  volume: string | null;
  message: string;
  status: BulkInquiryStatus;
  admin_memo: string | null;
  handled_by: string | null;
  handled_at: string | null;
  source_ip: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
}
