
import { User, UserRole, Plant, Product, Location, Order, OrderStatus, OrderItem } from './types';

export const MOCK_USERS: User[] = [
  { id: 'u1', role: UserRole.USER, email: 'mario@example.com', phone: '+39 333 1234567', name: 'Mario Rossi', created_at: new Date().toISOString() },
  { id: 'n1_owner', role: UserRole.NURSERY, email: 'vivaio.verde@example.com', phone: '+39 333 7654321', name: 'Verde Smeraldo Admin', created_at: new Date().toISOString() }
];

export const MOCK_LOCATIONS: Location[] = [
  { id: 'loc1', name: 'Soggiorno', icon: 'fa-couch' },
  { id: 'loc2', name: 'Balcone', icon: 'fa-cloud-sun' },
  { id: 'loc3', name: 'Ufficio', icon: 'fa-briefcase' }
];

export const MOCK_PLANTS: Plant[] = [
  { id: 'p1', user_id: 'u1', location_id: 'loc1', species: 'Monstera Deliciosa', nickname: 'Monty', indoor_outdoor: 'INDOOR', pot_size: '25cm', image: 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?q=80&w=400&h=600&auto=format&fit=crop', health_score: 95 },
  { id: 'p2', user_id: 'u1', location_id: 'loc1', species: 'Ficus Lyrata', nickname: 'Lira', indoor_outdoor: 'INDOOR', pot_size: '30cm', image: 'https://images.unsplash.com/photo-1545239351-ef35f43d514b?q=80&w=400&h=600&auto=format&fit=crop', health_score: 82 },
  { id: 'p3', user_id: 'u1', location_id: 'loc2', species: 'Lavanda', nickname: 'Viola', indoor_outdoor: 'OUTDOOR', pot_size: '15cm', image: 'https://images.unsplash.com/photo-1595908129746-57ca1a63dd4d?q=80&w=400&h=600&auto=format&fit=crop', health_score: 100 },
  { id: 'p4', user_id: 'u1', location_id: 'loc3', species: 'Pothos', nickname: 'Pendino', indoor_outdoor: 'INDOOR', pot_size: '12cm', image: 'https://images.unsplash.com/photo-1591123120675-6f7f1aae0e5b?q=80&w=400&h=600&auto=format&fit=crop', health_score: 45 }
];

export const MOCK_PRODUCTS: Product[] = [
  { id: 'prod1', nursery_id: 'n1', category_id: 'cat1', name: 'Biostimolante Alga Nera', brand: 'GreenBio', price: 15.50, active: true, image: 'https://images.unsplash.com/photo-1585314062340-f1a5a7c9328d?q=80&w=400&h=400&auto=format&fit=crop', description: 'Fertilizzante liquido a base di alghe.', inventory_qty: 25 },
  { id: 'prod2', nursery_id: 'n1', category_id: 'cat2', name: 'Olio di Neem Spray', brand: 'EcoGuard', price: 12.90, active: true, image: 'https://images.unsplash.com/photo-1622329380907-7a87e8346387?q=80&w=400&h=400&auto=format&fit=crop', description: 'Insetticida naturale.', inventory_qty: 10 }
];

export const MOCK_ORDERS: Order[] = [
  { 
    id: 'ORD-102', 
    user_id: 'u1', 
    userName: 'Mario Rossi',
    userPhone: '+39 333 1234567',
    userAddress: 'Via Milano 12, 20100 Milano (MI)',
    nursery_id: 'n1', 
    mode: 'LOCAL_DELIVERY', 
    status: OrderStatus.CONFIRMED_BY_SELLER, 
    total_amount: 45.00, 
    created_at: new Date(Date.now() - 7200000).toISOString(), // 2h fa
    flags: { urgent: true, coldWeather: true },
    packagingChecked: [],
    items: [
      { id: 'oi1', listingId: 'l1', title: 'Monstera Deliciosa', variantLabel: 'Vaso 12cm', qty: 1, price: 18.50, image: 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?q=80&w=100&h=100&auto=format&fit=crop', isPlant: true, isFragile: true },
      { id: 'oi2', listingId: 'l2', title: 'Concime Organico', variantLabel: '1 Litro', qty: 2, price: 13.25, image: 'https://images.unsplash.com/photo-1585314062340-f1a5a7c9328d?q=80&w=100&h=100&auto=format&fit=crop', isPlant: false }
    ] 
  },
  { 
    id: 'ORD-105', 
    user_id: 'u2', 
    userName: 'Laura Bianchi',
    userPhone: '+39 347 9876543',
    nursery_id: 'n1', 
    mode: 'PICKUP', 
    status: OrderStatus.PENDING, 
    total_amount: 12.90, 
    created_at: new Date(Date.now() - 3600000).toISOString(), // 1h fa
    flags: { lowStock: true },
    packagingChecked: [],
    items: [
      { id: 'oi3', listingId: 'l2', title: 'Olio di Neem Spray', variantLabel: '500ml', qty: 1, price: 12.90, image: 'https://images.unsplash.com/photo-1622329380907-7a87e8346387?q=80&w=100&h=100&auto=format&fit=crop', isPlant: false }
    ] 
  }
];
