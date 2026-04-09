
export enum UserRole {
  USER = 'USER',
  NURSERY = 'NURSERY',
  ADMIN = 'ADMIN'
}

export interface User {
  id: string;
  role: UserRole;
  email: string;
  phone: string;
  name: string;
  created_at: string;
}

// --- ANALYTICS & DASHBOARD ---

export interface DashboardStats {
  salesWeekly: number;
  salesGrowth: number;
  conversionRate: number;
  customerSatisfaction: number;
  funnel: {
    views: number;
    carts: number;
    purchases: number;
  };
}

export interface Recommendation {
  id: string;
  title: string;
  reason: string;
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  cta: string;
  actionType: 'CATALOG' | 'STOCK' | 'ORDERS';
}

export interface TrendItem {
  id: string;
  name: string;
  metric: string; // es: "+15% visite" o "Top seller"
  stock: number;
  tip: string;
}

export interface CatalogHealth {
  realPhotos: number; // 0-100
  attributes: number;
  descriptions: number;
  variants: number;
}

// --- CATALOGO E ORDINI (esistenti) ---

export type ListingStatus = 'ACTIVE' | 'DRAFT' | 'OUT_OF_STOCK';
export type ListingType = 'PLANT' | 'PRODUCT';

export interface Variant {
  id: string;
  sku: string;
  label: string;
  price: number;
  stock: number;
  low_stock_threshold: number;
  weight_g?: number;
}

export interface Listing {
  id: string;
  nursery_id: string;
  type: ListingType;
  masterId?: string;
  title: string;
  category: string;
  brand?: string;
  status: ListingStatus;
  mainImage: string;
  sellerImages: string[];
  shortDescription: string;
  longDescription: string;
  variants: Variant[];
  attributes: {
    light?: 'BASSA' | 'MEDIA' | 'ALTA';
    water?: 'BASSA' | 'MEDIA' | 'ALTA';
    petSafe?: boolean;
    difficulty?: 'FACILE' | 'MEDIA' | 'ESPERTA';
    indoor_outdoor?: 'INDOOR' | 'OUTDOOR' | 'BOTH';
  };
  qualityScore: number;
}

export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED_BY_SELLER = 'CONFIRMED_BY_SELLER',
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED'
}

export interface OrderItem {
  id: string;
  listingId: string;
  title: string;
  variantLabel: string;
  qty: number;
  price: number;
  image: string;
  isPlant: boolean;
  isFragile?: boolean;
}

export interface Order {
  id: string;
  user_id: string;
  userName: string;
  userPhone: string;
  userAddress?: string;
  nursery_id: string;
  mode: 'PICKUP' | 'LOCAL_DELIVERY';
  status: OrderStatus;
  total_amount: number;
  created_at: string;
  items: OrderItem[];
  flags: {
    lowStock?: boolean;
    urgent?: boolean;
    coldWeather?: boolean;
  };
  packagingChecked: string[];
}

// --- MISSING TYPES ADDED TO FIX COMPILATION ERRORS ---

// Represents a user's plant in their personal collection
export interface Plant {
  id: string;
  user_id: string;
  location_id: string;
  species: string;
  nickname: string;
  indoor_outdoor: 'INDOOR' | 'OUTDOOR';
  pot_size: string;
  image: string;
  health_score: number;
}

// Represents a standalone product sold by nurseries
export interface Product {
  id: string;
  nursery_id: string;
  category_id: string;
  name: string;
  brand: string;
  price: number;
  active: boolean;
  image: string;
  description: string;
  inventory_qty: number;
}

// Represents a room or outdoor space where plants are located
export interface Location {
  id: string;
  name: string;
  icon: string;
}

// Represents an action to be taken by the user for a plant
export interface Task {
  id: string;
  plantId: string;
  plantName: string;
  action: string;
  icon: string;
  status: 'TODO' | 'DONE' | 'OVERDUE';
  scheduledForISO: string;
  reason: string;
}

// Represents user preferences for finding suitable plants
export interface Scenario {
  room: string;
  light: string;
  difficulty: string;
  pets: string;
  size: string;
}

// Represents the response from the Gemini plant diagnosis service
export interface DiagnosisResult {
  actions: string[];
  products: {
    product_id: string;
    reason: string;
    isBestChoice: boolean;
  }[];
  explanation: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}
