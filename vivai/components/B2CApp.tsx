
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { User, Plant, Product, Location, Task, Scenario } from '../types';
import { createMyPlant, getMyPlants, getMyPlantDetail, type PlantCard, type PlantDetailCard } from '../services/plantService';
import { getLocations, type LocationCard } from '../services/locationService';
import { getProducts, type ProductCard } from '../services/productService';
import { getCart, countCartItems, changeCartItem } from "../services/cartService";
import { getMyOrders, getMyOrder, type OrderCard, type OrderDetailCard } from '../services/orderService';
import { getDiscoverCategories, getDiscoverPlant, getDiscoverPlants, getScenarioMatches, type DiscoverCategory, type DiscoverPlant, type DiscoverMatch } from '../services/discoverService';
import {
  getGeolocationPermissionState,
  loadWeatherFromCachedContext,
  requestDeviceWeather,
  type GeoPermissionState,
  type WeatherSnapshot,
} from "../services/weatherService";

import { logout } from "../services/authService"; 
import { getWateringStrategyMeta } from "../utils/plantLabels";
import {
  getAgendaTasks,
  generateAgendaTasks,
  completeAgendaTask,
  skipAgendaTask,
  snoozeAgendaTask,
  type AgendaTaskCard,
} from "../services/agendaService";

import {
  getRecentPlantEvents,
  type PlantEventCard,
} from "../services/plantEventService";
interface B2CAppProps {
  user: User;
}

type Tab = 'COLLECTION' | 'SHOP' | 'DISCOVER' | 'ORDERS';
type SubTab = 'OVERVIEW' | 'AGENDA' | 'HISTORY';
type DexView = 'HOME' | 'SCENARIO' | 'RESULTS';

type OrdersView = "CART" | "CHECKOUT" | "SUCCESS";
type OrdersMode = "CART_FLOW" | "MY_ORDERS";
type OrderHistoryFilter = "TO_PICK_UP" | "PICKED_UP";

type CompatibilityResult = DiscoverMatch;


type AddPlantSubmitPayload = {
  plant_species_id: number;
  nickname: string;
  location_id: number;
  indoor_outdoor: 'INDOOR' | 'OUTDOOR';
  pot_diameter_cm: number | null;
  purchase_date: string | null;
  user_notes: string | null;
};

type AddPlantSheetState = {
  open: boolean;
  species: DiscoverPlant | null;
  defaultLocationId: number | null;
};

type BottomSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children?: React.ReactNode;
};

const BottomSheet: React.FC<BottomSheetProps> = React.memo(
  ({ isOpen, onClose, title, children }) => (
    <div className={`fixed inset-0 z-[300] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className="absolute inset-0 bg-v-dark/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className={`absolute bottom-0 left-0 right-0 max-w-md mx-auto bg-v-surface rounded-t-dex-xl shadow-2xl transition-transform duration-500 transform ${isOpen ? 'translate-y-0' : 'translate-y-full'} p-6 pb-10`}>
        <div className="flex justify-between items-center mb-6">
          <h4 className="text-sm font-black text-v-accent uppercase tracking-widest">{title}</h4>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-v-dark/50 flex items-center justify-center text-v-light">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div className="space-y-2">{children}</div>
      </div>
    </div>
  )
);

const inferIndoorOutdoorFromLocationId = (
  locationId: number | null,
  locations: LocationCard[]
): 'INDOOR' | 'OUTDOOR' => {
  const loc = locations.find((item) => Number(item.id) === Number(locationId));
  if (!loc) return 'INDOOR';

  const name = (loc.name || '').toLowerCase();
  if (name.includes('balcone') || name.includes('terrazzo') || name.includes('giardino')) {
    return 'OUTDOOR';
  }

  return 'INDOOR';
};

type AddPlantSheetProps = {
  open: boolean;
  species: DiscoverPlant | null;
  defaultLocationId: number | null;
  locations: LocationCard[];
  onClose: () => void;
  onSubmit: (payload: AddPlantSubmitPayload) => Promise<void>;
};

const AddPlantSheet: React.FC<AddPlantSheetProps> = ({
  open,
  species,
  defaultLocationId,
  locations,
  onClose,
  onSubmit,
}) => {
  const [nickname, setNickname] = useState('');
  const [locationId, setLocationId] = useState<string>('');
  const [indoorOutdoor, setIndoorOutdoor] = useState<'INDOOR' | 'OUTDOOR'>('INDOOR');
  const [potDiameterCm, setPotDiameterCm] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [userNotes, setUserNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !species) return;

    const initialLocationId = defaultLocationId ? String(defaultLocationId) : '';
    setNickname(species.commonName || species.scientificName || '');
    setLocationId(initialLocationId);
    setIndoorOutdoor(
      inferIndoorOutdoorFromLocationId(
        defaultLocationId ?? null,
        locations,
      )
    );
    setPotDiameterCm('');
    setPurchaseDate('');
    setUserNotes('');
    setError(null);
    setSubmitting(false);
  }, [open, species, defaultLocationId, locations]);

  const handleSubmit = async () => {
    if (!species) return;

    const cleanNickname = nickname.trim();
    if (!cleanNickname) {
      setError('Il nome della tua pianta è obbligatorio.');
      return;
    }

    if (!locationId) {
      setError('Seleziona una stanza.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      await onSubmit({
        plant_species_id: Number(species.id),
        nickname: cleanNickname,
        location_id: Number(locationId),
        indoor_outdoor: indoorOutdoor,
        pot_diameter_cm: potDiameterCm ? Number(potDiameterCm) : null,
        purchase_date: purchaseDate || null,
        user_notes: userNotes.trim() || null,
      });
    } catch (e: any) {
      setError(e?.message ?? 'Errore salvataggio pianta');
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet isOpen={open} onClose={onClose} title="Aggiungi pianta">
      {species && (
        <div className="space-y-4">
          <div className="flex space-x-4">
            <img
              src={species.image || '/placeholder-plant.jpg'}
              className="w-16 h-20 rounded-lg object-cover"
            />
            <div>
              <h5 className="font-black text-v-light">
                {species.commonName || species.scientificName}
              </h5>
              <p className="text-[10px] text-v-accent/50 italic uppercase">
                {species.scientificName}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-v-accent/50">
              Nome della tua pianta
            </label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="w-full bg-v-dark/40 rounded-dex-lg px-4 py-3 text-xs text-v-light border border-v-accent/10 outline-none"
              placeholder="Es. Gerry"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-v-accent/50">
              Stanza
            </label>
            <select
              value={locationId}
              onChange={(e) => {
                const nextValue = e.target.value;
                setLocationId(nextValue);
                setIndoorOutdoor(
                  inferIndoorOutdoorFromLocationId(
                    nextValue ? Number(nextValue) : null,
                    locations,
                  )
                );
              }}
              className="w-full bg-v-dark/40 rounded-dex-lg px-4 py-3 text-xs text-v-light border border-v-accent/10 outline-none"
            >
              <option value="">Seleziona una stanza</option>
              {locations.map((loc) => (
                <option key={loc.id} value={String(loc.id)}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-v-accent/50">
              Indoor / Outdoor
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['INDOOR', 'OUTDOOR'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setIndoorOutdoor(value)}
                  className={`py-3 rounded-dex-lg text-[10px] font-black uppercase border ${
                    indoorOutdoor === value
                      ? 'bg-v-accent text-v-dark border-v-accent'
                      : 'bg-v-dark/40 text-v-accent border-v-accent/10'
                  }`}
                >
                  {value === 'INDOOR' ? 'Interno' : 'Esterno'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-v-accent/50">
              Diametro vaso (cm)
            </label>
            <input
              type="number"
              min="1"
              value={potDiameterCm}
              onChange={(e) => setPotDiameterCm(e.target.value)}
              className="w-full bg-v-dark/40 rounded-dex-lg px-4 py-3 text-xs text-v-light border border-v-accent/10 outline-none"
              placeholder="Es. 14"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-v-accent/50">
              Data acquisto
            </label>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="w-full bg-v-dark/40 rounded-dex-lg px-4 py-3 text-xs text-v-light border border-v-accent/10 outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-v-accent/50">
              Note
            </label>
            <textarea
              value={userNotes}
              onChange={(e) => setUserNotes(e.target.value)}
              className="w-full bg-v-dark/40 rounded-dex-lg px-4 py-3 text-xs text-v-light border border-v-accent/10 outline-none min-h-[88px]"
              placeholder="Note facoltative"
            />
          </div>

          {error && (
            <p className="text-[10px] text-red-300">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-v-accent text-v-dark py-4 rounded-dex-lg text-xs font-black uppercase tracking-widest disabled:opacity-60"
          >
            {submitting ? 'Salvataggio...' : 'Salva pianta'}
          </button>
        </div>
      )}
    </BottomSheet>
  );
};

const B2CApp: React.FC<B2CAppProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<Tab>('COLLECTION');
  const [subTab, setSubTab] = useState<SubTab>('OVERVIEW');
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);

  const [selectedPlantDetail, setSelectedPlantDetail] = useState<PlantDetailCard | null>(null);
const [selectedPlantLoading, setSelectedPlantLoading] = useState(false);
const [selectedPlantError, setSelectedPlantError] = useState<string | null>(null);
const [expandedLocationId, setExpandedLocationId] = useState<number | null>(null);


  const [ordersView, setOrdersView] = useState<OrdersView>("CART");


const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
const [weatherLoading, setWeatherLoading] = useState(false);
const [weatherError, setWeatherError] = useState<string | null>(null);
const [geoPermission, setGeoPermission] = useState<GeoPermissionState>("prompt");


const [discoverCategories, setDiscoverCategories] = useState<DiscoverCategory[]>([]);
const [discoverResults, setDiscoverResults] = useState<DiscoverPlant[]>([]);
const [discoverLoading, setDiscoverLoading] = useState(false);
const [discoverError, setDiscoverError] = useState<string | null>(null);

const [selectedSpecies, setSelectedSpecies] = useState<DiscoverPlant | null>(null);
const [speciesLoading, setSpeciesLoading] = useState(false);

const [rankedResults, setRankedResults] = useState<CompatibilityResult[]>([]);
const [matchLoading, setMatchLoading] = useState(false);
const [matchError, setMatchError] = useState<string | null>(null);
const [ordersMode, setOrdersMode] = useState<OrdersMode>("CART_FLOW");
const [orderHistoryFilter, setOrderHistoryFilter] = useState<OrderHistoryFilter>("TO_PICK_UP");

const [myOrders, setMyOrders] = useState<OrderCard[]>([]);
const [myOrdersLoading, setMyOrdersLoading] = useState(false);
const [myOrdersError, setMyOrdersError] = useState<string | null>(null);

const [selectedOrder, setSelectedOrder] = useState<OrderDetailCard | null>(null);
const [selectedOrderLoading, setSelectedOrderLoading] = useState(false);

  // State per collezione e task reali nel ciclo di vita della sessione
const [userPlants, setUserPlants] = useState<PlantCard[]>([]);

const [agendaTasks, setAgendaTasks] = useState<AgendaTaskCard[]>([]);
const [agendaLoading, setAgendaLoading] = useState(false);
const [agendaError, setAgendaError] = useState<string | null>(null);
const [agendaGenerating, setAgendaGenerating] = useState<number | null>(null);
const [agendaGenerateMessage, setAgendaGenerateMessage] = useState<string | null>(null);
const [addPlantSheet, setAddPlantSheet] = useState<AddPlantSheetState>({
  open: false,
  species: null,
  defaultLocationId: null,
});



type HistoryTypeFilter =
  | "ALL"
  | "WATERED"
  | "FERTILIZED"
  | "CHECKED"
  | "TREATED"
  | "PRUNED"
  | "REPOTTED";

const [historyTypeFilter, setHistoryTypeFilter] = useState<HistoryTypeFilter>("ALL");
const [historyPlantFilter, setHistoryPlantFilter] = useState<number | null>(null);
const [historyItems, setHistoryItems] = useState<PlantEventCard[]>([]);
const [historyLoading, setHistoryLoading] = useState(false);
const [historyError, setHistoryError] = useState<string | null>(null);



  useEffect(() => {
  if (activeTab === "ORDERS" && ordersMode === "MY_ORDERS") {
    loadMyOrders();
  }
}, [activeTab, ordersMode]);

useEffect(() => {
  if (activeTab === "ORDERS") {
    setOrdersMode("CART_FLOW");
    setOrdersView("CART");
    setCreatedOrder(null);
    refreshCart();
  }
}, [activeTab]);

const openPlantDetail = async (plantId: number) => {
  try {
    setSelectedPlantLoading(true);
    setSelectedPlantError(null);
    const data = await getMyPlantDetail(plantId);
    setSelectedPlantDetail(data);
  } catch (e: any) {
    setSelectedPlantError(e?.message ?? "Errore caricamento dettaglio pianta");
    setSelectedPlantDetail(null);
  } finally {
    setSelectedPlantLoading(false);
  }
};

  const orderStatusLabel = (status: string) => {
  switch (status) {
    case "NEW":
      return "Ricevuto";
    case "CONFIRMED":
      return "Confermato";
    case "READY_FOR_PICKUP":
      return "Pronto al ritiro";
    case "COMPLETED":
      return "Ritirato";
    case "CANCELLED":
      return "Annullato";
    default:
      return status;
  }
};

const syncWeatherFromDevice = async () => {
  try {
    setWeatherLoading(true);
    setWeatherError(null);

    const data = await requestDeviceWeather();
    setWeather(data);
    setGeoPermission("granted");
  } catch (e: any) {
    setWeatherError(e?.message ?? "Errore localizzazione/meteo.");

    try {
      const nextPermission = await getGeolocationPermissionState();
      setGeoPermission(nextPermission);
    } catch {
      // no-op
    }
  } finally {
    setWeatherLoading(false);
  }
};

useEffect(() => {
  let alive = true;

  (async () => {
    try {
      const permission = await getGeolocationPermissionState();
      if (!alive) return;

      setGeoPermission(permission);
      setWeatherError(null);
      setWeatherLoading(true);

      if (permission === "granted") {
        const live = await requestDeviceWeather();
        if (alive) setWeather(live);
      } else {
        const cached = await loadWeatherFromCachedContext();
        if (alive && cached) setWeather(cached);
      }
    } catch (e: any) {
      if (alive) {
        setWeatherError(e?.message ?? "Errore caricamento meteo.");
      }
    } finally {
      if (alive) setWeatherLoading(false);
    }
  })();

  return () => {
    alive = false;
  };
}, []);


const weatherHeaderText = useMemo(() => {
  if (weatherLoading) return "Recupero meteo…";

  if (weather) {
    const place = weather.city ?? "qui";
    const parts: string[] = [`Oggi a ${place}`];

    if (weather.weatherLabel) {
      parts.push(weather.weatherLabel);
    }

    if (weather.temperatureC !== null) {
      parts.push(`${Math.round(weather.temperatureC)}°C`);
    }

    return parts.join(" • ");
  }

  if (geoPermission === "denied") return "Posizione non concessa";
  if (geoPermission === "unsupported") return "Geolocalizzazione non supportata";

  return "Attiva la posizione per il meteo";
}, [weatherLoading, weather, geoPermission]);

const orderDateLabel = (value: string) =>
  new Date(value).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const loadMyOrders = async () => {
  try {
    setMyOrdersLoading(true);
    setMyOrdersError(null);
    const data = await getMyOrders();
    setMyOrders(data);
  } catch (e: any) {
    setMyOrdersError(e?.message ?? "Errore caricamento ordini");
    setMyOrders([]);
  } finally {
    setMyOrdersLoading(false);
  }
};

const openOrderDetail = async (orderId: number) => {
  try {
    setSelectedOrderLoading(true);
    setMyOrdersError(null);
    const data = await getMyOrder(orderId);
    setSelectedOrder(data);
  } catch (e: any) {
    setMyOrdersError(e?.message ?? "Errore caricamento dettaglio ordine");
    setSelectedOrder(null);
  } finally {
    setSelectedOrderLoading(false);
  }
};

const visibleOrders = useMemo(() => {
  const toPickUpStatuses = ["NEW", "CONFIRMED", "READY_FOR_PICKUP"];
  const pickedUpStatuses = ["COMPLETED"];

  return myOrders.filter((order) =>
    orderHistoryFilter === "TO_PICK_UP"
      ? toPickUpStatuses.includes(order.status)
      : pickedUpStatuses.includes(order.status)
  );
}, [myOrders, orderHistoryFilter]);


  // State PlantDex
  const [dexView, setDexView] = useState<DexView>('HOME');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [scenario, setScenario] = useState<Scenario>({
    room: 'Soggiorno',
    light: 'Media',
    difficulty: 'Facile',
    pets: 'Non importa',
    size: 'Media'
  });

  // State Picker & Drawers

 

const [checkoutForm, setCheckoutForm] = useState({
  customerName: user?.name ?? "",
  customerPhone: "",
  customerEmail: "",
  notes: "",
  fulfillmentMethod: "PICKUP_IN_STORE",
  paymentMethod: "PAY_ON_PICKUP",
});



const [checkoutError, setCheckoutError] = useState<string | null>(null);
const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
const [createdOrder, setCreatedOrder] = useState<{ id: number; code: string } | null>(null);


  const [pickerOpen, setPickerOpen] = useState<{ open: boolean; key: keyof Scenario | null }>({ open: false, key: null });
  const [selectedResult, setSelectedResult] = useState<CompatibilityResult | null>(null);





  useEffect(() => {
  if (activeTab === "ORDERS") {
    setOrdersMode("CART_FLOW");
    setOrdersView("CART");
    setCreatedOrder(null);
    refreshCart(); // fa GET /api/cart e setta lo state
  }
}, [activeTab]);
useEffect(() => {
  let alive = true;

  (async () => {
    try {
      const plants = await getMyPlants(100);
      console.log("plants from API:", plants);
      if (alive) setUserPlants(plants);
    } catch (e) {
      console.error("Errore getMyPlants:", e);
    }
  })();

  return () => { alive = false; };
}, []);
const [cart, setCart] = useState<{ items: any[]; total: number }>({ items: [], total: 0 });
const [cartLoading, setCartLoading] = useState(false);

const refreshCart = async () => {
  setCartLoading(true);
  try {
    const c = await getCart();
    setCart(c);
    setCartCount(countCartItems(c)); // mantiene badge aggiornato
  } finally {
    setCartLoading(false);
  }
};

const submitOrder = async () => {
  setCheckoutError(null);

  const phone = checkoutForm.customerPhone.trim();
  const email = checkoutForm.customerEmail.trim();

  if (!phone) {
    setCheckoutError("Il numero di telefono è obbligatorio.");
    return;
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setCheckoutError("Email non valida.");
    return;
  }

  if (!cart.items.length) {
    setCheckoutError("Il carrello è vuoto.");
    return;
  }

  try {
    setCheckoutSubmitting(true);

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customerName: checkoutForm.customerName.trim(),
        customerPhone: phone,
        customerEmail: email || null,
        notes: checkoutForm.notes.trim() || null,
        fulfillmentMethod: "PICKUP_IN_STORE",
        paymentMethod: "PAY_ON_PICKUP",
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setCheckoutError(data?.error || "Errore nella creazione ordine.");
      return;
    }

    setCreatedOrder({
      id: data.order.id,
      code: data.order.code,
    });

    await refreshCart();
    await refreshCartCount();
    setOrdersView("SUCCESS");
  } catch (e) {
    console.error(e);
    setCheckoutError("Errore di rete.");
  } finally {
    setCheckoutSubmitting(false);
  }
};

useEffect(() => {
  let alive = true;

  if (activeTab !== 'DISCOVER' || dexView !== 'HOME') return () => { alive = false; };

  const t = window.setTimeout(async () => {
    try {
      setDiscoverLoading(true);
      setDiscoverError(null);

      const data = await getDiscoverPlants({
        q: searchQuery.trim() || undefined,
        categorySlug: activeCategory || undefined,
        limit: 12,
      });

      if (alive) setDiscoverResults(data);
    } catch (e: any) {
      if (alive) {
        setDiscoverError(e?.message ?? 'Errore caricamento Discover');
        setDiscoverResults([]);
      }
    } finally {
      if (alive) setDiscoverLoading(false);
    }
  }, 250);

  return () => {
    alive = false;
    window.clearTimeout(t);
  };
}, [searchQuery, activeCategory, activeTab, dexView]);

useEffect(() => {
  let alive = true;

  (async () => {
    try {
      const data = await getDiscoverCategories();
      if (alive) setDiscoverCategories(data);
    } catch (e) {
      console.error('Errore caricamento categorie Discover', e);
    }
  })();

  return () => { alive = false; };
}, []);



const [cartCount, setCartCount] = useState(0);
const [cartBump, setCartBump] = useState(false);
const prevCartCountRef = useRef(0);
const refreshCartCount = async () => {
  try {
    const cart = await getCart();
    const nextCount = countCartItems(cart);

    const prev = prevCartCountRef.current;
    prevCartCountRef.current = nextCount;

    setCartCount(nextCount);

    // anima solo se aumenta
    if (nextCount > prev) {
      setCartBump(true);
      window.setTimeout(() => setCartBump(false), 250);
    }
  } catch (e) {
    console.error("Cart refresh failed", e);
  }
};



useEffect(() => {
  if (activeTab !== "COLLECTION") return;

  if (subTab === "HISTORY") {
    loadHistory();
  } else {
    loadAgenda();
  }
}, [activeTab, subTab, historyTypeFilter, historyPlantFilter]);


const [products, setProducts] = useState<ProductCard[]>([]);
const [productsLoading, setProductsLoading] = useState(true);
const [productsError, setProductsError] = useState<string | null>(null);

useEffect(() => {
  let alive = true;
  (async () => {
    try {
      setProductsLoading(true);
      setProductsError(null);
      const data = await getProducts(50);
      if (alive) setProducts(data);
    } catch (e: any) {
      if (alive) setProductsError(e?.message ?? "Errore caricamento prodotti");
    } finally {
      if (alive) setProductsLoading(false);
    }
  })();
  return () => { alive = false; };
}, []);



const wateringMeta = getWateringStrategyMeta(
  selectedPlantDetail?.species?.watering_strategy
);
const [locations, setLocations] = useState<LocationCard[]>([]);
const [locationsLoading, setLocationsLoading] = useState(true);
const [locationsError, setLocationsError] = useState<string | null>(null);

useEffect(() => {
  let alive = true;
  (async () => {
    try {
      setLocationsLoading(true);
      setLocationsError(null);
      const data = await getLocations();
      if (alive) setLocations(data);
    } catch (e: any) {
      if (alive) setLocationsError(e?.message ?? "Errore caricamento stanze");
    } finally {
      if (alive) setLocationsLoading(false);
    }
  })();
  return () => { alive = false; };
}, []);

const openAddPlantSheet = (entry: DiscoverPlant) => {
  const defaultLocation =
    locations.find((l) => l.name === scenario.room) ??
    locations[0] ??
    null;

  setSelectedSpecies(null);
  setSelectedResult(null);
  setAddPlantSheet({
    open: true,
    species: entry,
    defaultLocationId: defaultLocation ? Number(defaultLocation.id) : null,
  });
};



const handleCreateMyPlant = async (payload: AddPlantSubmitPayload) => {
  await createMyPlant(payload);

  const plants = await getMyPlants(6);
  setUserPlants(plants);
  setAgendaGenerateMessage('Pianta aggiunta correttamente.');
  setAddPlantSheet({
    open: false,
    species: null,
    defaultLocationId: null,
  });
  setActiveTab('COLLECTION');
  setSubTab('OVERVIEW');
  setDexView('HOME');
};

  const loadScenarioResults = async () => {
    try {
      setMatchLoading(true);
      setMatchError(null);
      const data = await getScenarioMatches(scenario, 8);
      setRankedResults(data);
      setDexView('RESULTS');
    } catch (e: any) {
      setMatchError(e?.message ?? 'Errore match scenario');
      setRankedResults([]);
      setDexView('RESULTS');
    } finally {
      setMatchLoading(false);
    }
  };

const formatAgendaDate = (value: string) =>
  new Date(value).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
  });

const agendaTaskIcon = (taskType: AgendaTaskCard["task_type"]) => {
  switch (taskType) {
    case "CHECK_WATER":
      return "fa-droplet";
    case "FERTILIZE":
      return "fa-seedling";
    case "CHECK_HEALTH":
      return "fa-eye";
    case "TREAT":
      return "fa-shield-virus";
    case "PRUNE":
      return "fa-scissors";
    case "REPOT":
      return "fa-box-open";
    default:
      return "fa-list-check";
  }
};

const agendaStatusLabel = (status: AgendaTaskCard["status"]) => {
  switch (status) {
    case "TODO":
      return "Da fare";
    case "DONE":
      return "Fatto";
    case "SKIPPED":
      return "Saltato";
    case "SNOOZED":
      return "Rimandato";
    default:
      return status;
  }
};

const eventIcon = (eventType: PlantEventCard["event_type"]) => {
  switch (eventType) {
    case "WATERED":
      return "fa-droplet";
    case "FERTILIZED":
      return "fa-seedling";
    case "CHECKED":
      return "fa-eye";
    case "TREATED":
      return "fa-shield-virus";
    case "PRUNED":
      return "fa-scissors";
    case "REPOTTED":
      return "fa-box-open";
    default:
      return "fa-check";
  }
};

const eventLabel = (eventType: PlantEventCard["event_type"]) => {
  switch (eventType) {
    case "WATERED":
      return "Annaffiata";
    case "FERTILIZED":
      return "Concimata";
    case "CHECKED":
      return "Controllata";
    case "TREATED":
      return "Trattata";
    case "PRUNED":
      return "Potata";
    case "REPOTTED":
      return "Rinvasata";
    case "SKIPPED_TASK":
      return "Attività saltata";
    default:
      return eventType;
  }
};

const loadAgenda = async () => {
  try {
    setAgendaLoading(true);
    setAgendaError(null);
    const data = await getAgendaTasks({ scope: "open", limit: 100 });
    setAgendaTasks(data);
  } catch (e: any) {
    setAgendaError(e?.message ?? "Errore caricamento agenda");
    setAgendaTasks([]);
  } finally {
    setAgendaLoading(false);
  }
};

const loadHistory = async () => {
  try {
    setHistoryLoading(true);
    setHistoryError(null);

    const data = await getRecentPlantEvents(100, {
      onlyAgenda: true,
      plantId: historyPlantFilter ?? undefined,
      eventType: historyTypeFilter === "ALL" ? undefined : historyTypeFilter,
    });

    setHistoryItems(data);
  } catch (e: any) {
    setHistoryError(e?.message ?? "Errore caricamento diario");
    setHistoryItems([]);
  } finally {
    setHistoryLoading(false);
  }
};

const handleGenerateAgenda = async (periodDays: 7 | 30 | 90) => {
  try {
    setAgendaGenerating(periodDays);
    setAgendaGenerateMessage(null);

    const res = await generateAgendaTasks(periodDays, buildAgendaContext());

    setAgendaGenerateMessage(
      `Generate ${res.created} attività, ${res.skipped} già presenti.`
    );

    await loadAgenda();
    await loadHistory();
  } catch (e: any) {
    setAgendaGenerateMessage(e?.message ?? "Errore generazione agenda");
  } finally {
    setAgendaGenerating(null);
  }
};

const handleAgendaComplete = async (task: AgendaTaskCard) => {
  try {
    await completeAgendaTask(task.id);
    await loadAgenda();
    await loadHistory();
  } catch (e) {
    console.error(e);
  }
};

const handleAgendaSkip = async (task: AgendaTaskCard) => {
  try {
    await skipAgendaTask(task.id, { reason: "Non necessario oggi" });
    await loadAgenda();
    await loadHistory();
  } catch (e) {
    console.error(e);
  }
};

const handleAgendaSnooze = async (task: AgendaTaskCard, days = 2) => {
  try {
    await snoozeAgendaTask(task.id, days);
    await loadAgenda();
  } catch (e) {
    console.error(e);
  }
};

const plantsByLocation = useMemo(() => {
  const grouped = new Map<number, PlantCard[]>();

  for (const loc of locations) {
    grouped.set(Number(loc.id), []);
  }

  for (const plant of userPlants) {
    const plantAny = plant as any;

    const directLocationId =
      plantAny.location_id != null ? Number(plantAny.location_id) : null;

    if (directLocationId && grouped.has(directLocationId)) {
      grouped.get(directLocationId)!.push(plant);
      continue;
    }

    // fallback utile se il backend restituisce solo location_name
    const fallbackLocation = locations.find(
      (loc) =>
        (plantAny.location_name || "").trim().toLowerCase() ===
        (loc.name || "").trim().toLowerCase()
    );

    if (fallbackLocation) {
      grouped.get(Number(fallbackLocation.id))?.push(plant);
    }
  }

  return grouped;
}, [locations, userPlants]);

const buildAgendaContext = () => {
  // Se nel tuo branch hai già gli state meteo,
  // arricchisci qui con temperatura / umidità / weather code.
  return {};
};

  const CompatibilityBadge = ({ leaves, label }: { leaves: number; label: string }) => (
    <div className="flex items-center space-x-1.5">
      <div className="flex space-x-0.5">
        {[...Array(5)].map((_, i) => (
          <i key={i} className={`fa-solid fa-leaf text-[8px] ${i < leaves ? 'text-v-accent' : 'text-v-surface'}`}></i>
        ))}
      </div>
      <span className="text-[9px] font-black uppercase text-v-accent/70 tracking-tighter">{label}</span>
    </div>
  );

  const renderHome = () => (
    <div className="space-y-8 fade-up p-6 pb-40">
      <header className="space-y-1">
        <h1 className="text-3xl font-black text-v-light uppercase tracking-tighter">Discover</h1>
        <div className="flex items-center space-x-2">
           <span className="text-[9px] font-bold text-v-accent uppercase tracking-widest bg-v-accent/10 px-2 py-1 rounded">PlantDex</span>
        </div>
      </header>

      <div 
        onClick={() => setDexView('SCENARIO')}
        className="bg-v-accent p-8 rounded-dex-xl shadow-2xl relative overflow-hidden group active:scale-[0.98] transition-all cursor-pointer"
      >
        <div className="relative z-10 space-y-4">
          <h2 className="text-v-dark text-2xl font-black leading-tight">Trova la pianta<br/>ideale per te</h2>
          <p className="text-v-dark/60 text-xs font-medium max-w-[180px]">Configura il tuo spazio e scopri cosa cresce meglio.</p>
          <div className="bg-v-dark text-v-accent inline-flex px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest">Configura ora</div>
        </div>
        <i className="fa-solid fa-compass absolute -right-6 -bottom-6 text-9xl text-v-dark/5 rotate-12 group-hover:rotate-45 transition-transform duration-700"></i>
      </div>

      <section className="space-y-4">
        <h3 className="text-[10px] font-black text-v-accent/40 uppercase tracking-widest pl-1">Categorie</h3>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
              activeCategory === null
                ? 'bg-v-accent text-v-dark border-v-accent'
                : 'bg-v-surface/30 text-v-accent border-v-accent/10'
            }`}
          >
            Tutte
          </button>

          {discoverCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory((prev) => (prev === cat.slug ? null : cat.slug))}
              className={`px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all whitespace-nowrap ${
                activeCategory === cat.slug
                  ? 'bg-v-accent text-v-dark border-v-accent'
                  : 'bg-v-surface/30 text-v-accent border-v-accent/10'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </section>

      <div className="space-y-4">
        <h3 className="text-[10px] font-black text-v-accent/40 uppercase tracking-widest pl-1">Cerca nel PlantDex</h3>
        <div className="relative">
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Specie, nomi comuni o parole chiave..." 
            className="w-full bg-v-surface/40 rounded-dex-lg px-6 py-4 text-xs outline-none border border-v-accent/10 text-v-light placeholder:text-v-accent/30 focus:border-v-accent/40 transition-all" 
          />
          <i className="fa-solid fa-magnifying-glass absolute right-6 top-1/2 -translate-y-1/2 text-v-accent/30"></i>
        </div>
      </div>

      <section className="space-y-4">
        {discoverLoading && (
          <p className="text-[9px] text-v-accent/40 font-bold uppercase tracking-widest pl-1">
            Caricamento piante…
          </p>
        )}

        {!discoverLoading && discoverError && (
          <p className="text-[9px] text-v-accent/40 font-bold uppercase tracking-widest pl-1">
            Errore: {discoverError}
          </p>
        )}

        {!discoverLoading && !discoverError && discoverResults.length === 0 && (
          <p className="text-[9px] text-v-accent/40 font-bold uppercase tracking-widest pl-1">
            Nessun risultato.
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          {discoverResults.map((p) => (
            <div
              key={p.id}
              onClick={async () => {
                try {
                  setSpeciesLoading(true);
                  const detail = await getDiscoverPlant(p.id);
                  setSelectedSpecies(detail);
                } catch (e) {
                  console.error(e);
                } finally {
                  setSpeciesLoading(false);
                }
              }}
              className="bg-v-surface/30 p-4 rounded-dex-lg border border-v-accent/5 space-y-3 active:scale-95 transition-all cursor-pointer group"
            >
              <div className="aspect-square rounded-dex-md overflow-hidden bg-v-dark">
                <img
                  src={p.image || "https://via.placeholder.com/300?text=No+Image"}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              </div>

              <p className="text-[10px] font-black text-v-light leading-tight truncate">
                {p.commonName || p.scientificName}
              </p>
              <p className="text-[8px] text-v-accent/40 font-bold uppercase truncate italic">
                {p.scientificName}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  const renderScenario = () => (
    <div className="p-6 space-y-8 pb-40 fade-up">
      <header className="flex items-center space-x-4">
        <button onClick={() => setDexView('HOME')} className="w-10 h-10 rounded-xl bg-v-surface flex items-center justify-center text-v-accent border border-v-accent/10"><i className="fa-solid fa-chevron-left"></i></button>
        <h2 className="text-2xl font-black text-v-light uppercase tracking-tighter">Il tuo Spazio</h2>
      </header>

      <div className="bg-v-card rounded-dex-xl p-6 border border-v-accent/10 shadow-2xl space-y-6">
        <div className="space-y-2">
          {[
            { label: 'Dove starà', value: scenario.room, key: 'room', icon: 'fa-house', options: ['Soggiorno', 'Camera', 'Bagno', 'Cucina', 'Balcone', 'Ufficio'] },
            { label: 'Luce disponibile', value: scenario.light, key: 'light', icon: 'fa-sun', options: ['Non so', 'Bassa', 'Media', 'Alta'] },
            { label: 'Tua esperienza', value: scenario.difficulty, key: 'difficulty', icon: 'fa-user-graduate', options: ['Facile', 'Media', 'Esperta'] },
            { label: 'Pet o Bambini', value: scenario.pets, key: 'pets', icon: 'fa-paw', options: ['No', 'Sì', 'Non importa'] },
            { label: 'Dimensione ideale', value: scenario.size, key: 'size', icon: 'fa-maximize', options: ['Piccola', 'Media', 'Grande'] },
          ].map((slot, i) => (
            <div 
              key={i} 
              onClick={() => setPickerOpen({ open: true, key: slot.key as keyof Scenario })}
              className="flex items-center justify-between p-4 bg-v-dark/30 rounded-dex-md border border-v-accent/5 active:scale-[0.98] transition-all cursor-pointer hover:border-v-accent/20"
            >
              <div className="flex items-center space-x-3">
                <i className={`fa-solid ${slot.icon} text-v-accent/40 text-xs w-4 text-center`}></i>
                <span className="text-[10px] font-bold text-v-gray uppercase tracking-widest">{slot.label}</span>
              </div>
              <span className="text-xs font-black text-v-accent">{slot.value}</span>
            </div>
          ))}
        </div>

        <div className="pt-4 space-y-3 text-center">
          <button 
            onClick={loadScenarioResults}
            className="w-full bg-v-accent text-v-dark py-4 rounded-dex-lg text-xs font-black uppercase tracking-widest shadow-xl shadow-v-accent/10 active:scale-95 transition-all"
          >
            Mostrami le idee
          </button>
          <p className="text-[9px] text-v-accent/40 font-bold uppercase tracking-tighter italic">Analizziamo il catalogo per te...</p>
        </div>
      </div>
    </div>
  );

  const renderResults = () => (
    <div className="p-6 space-y-8 pb-40 fade-up">
      <header className="flex items-center space-x-4">
        <button onClick={() => setDexView('SCENARIO')} className="w-10 h-10 rounded-xl bg-v-surface flex items-center justify-center text-v-accent border border-v-accent/10"><i className="fa-solid fa-chevron-left"></i></button>
        <h2 className="text-2xl font-black text-v-light uppercase tracking-tighter">Consigliati</h2>
      </header>

      {matchLoading && (
        <p className="text-[10px] font-black text-v-accent/40 uppercase tracking-widest pl-1">Analisi in corso…</p>
      )}

      {!matchLoading && matchError && (
        <p className="text-[10px] font-black text-v-accent/40 uppercase tracking-widest pl-1">Errore: {matchError}</p>
      )}

      {!matchLoading && !matchError && rankedResults.length === 0 && (
        <p className="text-[10px] font-black text-v-accent/40 uppercase tracking-widest pl-1">Nessun match disponibile.</p>
      )}

      {!matchLoading && rankedResults.length > 0 && (
        <>
          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-v-accent/40 uppercase tracking-widest pl-1">Migliori Match</h3>
            <div className="space-y-4">
              {rankedResults.slice(0, 3).map((res, i) => (
                <div key={res.entry.id} className="bg-v-card rounded-dex-xl p-5 border border-v-accent/10 flex space-x-5 relative overflow-hidden">
                   <div className="w-24 h-32 rounded-dex-md overflow-hidden bg-v-dark flex-shrink-0">
                     <img src={res.entry.image} className="w-full h-full object-cover" />
                   </div>
                   <div className="flex-1 space-y-2 flex flex-col justify-center">
                      <div className="flex justify-between items-start">
                        <CompatibilityBadge leaves={res.leaves} label={res.label} />
                      </div>
                      <h4 className="text-base font-black text-v-light leading-tight">{res.entry.commonName}</h4>
                      <p className="text-[9px] text-v-accent/60 font-bold uppercase tracking-tight line-clamp-1 italic">{res.entry.scientificName}</p>
                      <p className="text-[9px] text-v-gray leading-tight italic line-clamp-1">{res.note}</p>
                      <div className="flex space-x-2 pt-2">
                        <button onClick={() => setSelectedResult(res)} className="px-4 py-2 bg-v-surface text-[8px] font-black uppercase text-v-accent rounded-lg border border-v-accent/10">Dettagli</button>
                        <button onClick={() => openAddPlantSheet(res.entry)} className="px-4 py-2 bg-v-accent text-[8px] font-black uppercase text-v-dark rounded-lg">Aggiungi</button>
                      </div>
                   </div>
                   {i === 0 && <div className="absolute top-0 right-0 bg-v-accent text-v-dark px-3 py-1 text-[8px] font-black uppercase rounded-bl-lg">Top Choice</div>}
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4 pt-4">
            <h3 className="text-[10px] font-black text-v-accent/40 uppercase tracking-widest pl-1">Altre opzioni</h3>
            <div className="grid grid-cols-2 gap-4">
              {rankedResults.slice(3).map(res => (
                <div key={res.entry.id} onClick={() => setSelectedResult(res)} className="bg-v-surface/30 p-4 rounded-dex-lg border border-v-accent/5 space-y-3 opacity-80 active:scale-95 transition-all">
                  <div className="aspect-square rounded-dex-md overflow-hidden bg-v-dark relative">
                    <img src={res.entry.image} className="w-full h-full object-cover opacity-60" />
                    <div className="absolute bottom-2 left-2"><CompatibilityBadge leaves={res.leaves} label={res.label} /></div>
                  </div>
                  <p className="text-[10px] font-black text-v-light leading-tight truncate">{res.entry.commonName}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col max-w-md mx-auto w-full relative h-screen bg-v-dark overflow-hidden">
      
      {/* Sub-Nav fixed solo su Collezione */}
      {activeTab === 'COLLECTION' && (
        <div className="px-5 pt-4 pb-2 z-50 bg-v-dark/80 backdrop-blur-md">
           <div className="flex space-x-1.5 bg-v-surface/40 p-1.5 rounded-dex-lg border border-v-accent/5">
            {[
              { id: 'OVERVIEW', label: 'Stanze' },
              { id: 'AGENDA', label: 'Agenda' },
              { id: 'HISTORY', label: 'Diario' }
            ].map(st => (
              <button key={st.id} onClick={() => setSubTab(st.id as SubTab)} className={`flex-1 py-2 text-[9px] font-black uppercase rounded-dex-md transition-all ${subTab === st.id ? 'bg-v-accent text-v-dark shadow-lg' : 'text-v-accent/40'}`}>
                {st.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto scrollbar-hide">
        {activeTab === 'COLLECTION' && (
          
          <div className="p-4 space-y-6 pb-40 fade-up">
            <header className="flex justify-between items-center px-1 pt-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    await logout();
                    window.location.reload(); // semplice e sicuro per ora
                  }}
                  className="w-9 h-9 rounded-xl bg-v-surface flex items-center justify-center text-v-accent border border-v-accent/10"
                  title="Logout"
                >
                  <i className="fa-solid fa-right-from-bracket text-xs"></i>
                </button>

                
              </div>
              <div>
                
                <div>
                <h1 className="text-xl font-black text-v-light leading-tight">
                  Ciao, {user.name.split(" ")[0]}
                </h1>

                <button
                  type="button"
                  onClick={syncWeatherFromDevice}
                  disabled={weatherLoading}
                  className="text-left"
                >
                  <p className="text-[9px] font-bold text-v-accent/50 uppercase tracking-widest">
                    {weatherHeaderText}
                  </p>

                  {!weather && geoPermission !== "granted" && (
                    <p className="text-[8px] font-bold text-v-accent/30 uppercase tracking-widest">
                      Tocca per usare la tua posizione
                    </p>
                  )}

                  {weatherError && (
                    <p className="text-[8px] font-bold text-red-300/70 uppercase tracking-widest">
                      {weatherError}
                    </p>
                  )}
                </button>
              </div>
              </div>
              <button className="w-9 h-9 rounded-xl bg-v-surface flex items-center justify-center text-v-accent border border-v-accent/10">
                <i className="fa-solid fa-bell text-xs"></i>
              </button>
            </header>

            {subTab === 'OVERVIEW' && (
              <div className="space-y-6">
                <section>
                  <div className="flex space-x-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
                    <section>
                      <div className="flex items-center justify-between mb-2 px-1">
                        <h3 className="text-[9px] font-black text-v-accent/50 uppercase tracking-widest">
                          Prossime Azioni
                        </h3>

                        <button
                          onClick={() => setSubTab("AGENDA")}
                          className="text-[8px] font-black uppercase tracking-widest text-v-accent"
                        >
                          Apri agenda
                        </button>
                      </div>

                      {agendaLoading && (
                        <p className="text-[9px] text-v-accent/50 px-1">Caricamento agenda…</p>
                      )}

                      {!agendaLoading && agendaError && (
                        <p className="text-[9px] text-red-300/80 px-1">{agendaError}</p>
                      )}

                      {!agendaLoading && !agendaError && agendaTasks.length === 0 && (
                        <p className="text-[9px] text-v-accent/50 px-1">
                          Nessuna attività generata. Vai in Agenda e genera il piano.
                        </p>
                      )}

                      {!agendaLoading && agendaTasks.length > 0 && (
                        <div className="flex space-x-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
                          {agendaTasks.slice(0, 5).map(task => (
                            <div
                              key={task.id}
                              className="min-w-[170px] bg-v-surface p-3 rounded-2xl border border-v-accent/10 shadow-lg space-y-2.5"
                            >
                              <div className="flex items-center space-x-2">
                                <div className="w-8 h-8 rounded-lg bg-v-dark flex items-center justify-center text-v-accent text-sm">
                                  <i className={`fa-solid ${agendaTaskIcon(task.task_type)}`}></i>
                                </div>

                                <div className="overflow-hidden">
                                  <p className="text-[10px] font-black text-v-light leading-none truncate">
                                    {task.plant_name || "Pianta"}
                                  </p>
                                  <p className="text-[8px] text-v-accent/60 font-bold uppercase truncate">
                                    {task.title}
                                  </p>
                                </div>
                              </div>

                              <p className="text-[8px] text-v-accent/50 uppercase font-bold">
                                {formatAgendaDate(task.snoozed_until || task.due_date)}
                              </p>

                              <button
                                onClick={() => handleAgendaComplete(task)}
                                className="w-full bg-v-accent text-v-dark py-1.5 rounded-lg text-[8px] font-black uppercase"
                              >
                                Fatto
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                </section>

                <section className="bg-v-surface/20 p-4 rounded-3xl border border-v-accent/5">
                  <h3 className="text-[9px] font-black text-v-accent uppercase tracking-widest mb-3 flex items-center gap-2">Le tue Piante ({userPlants.length})</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {userPlants.slice(0, 6).map(plant => (
                      <button
                        key={plant.id}
                        onClick={() => openPlantDetail(Number(plant.id))}
                        className="text-left bg-v-dark/40 rounded-xl p-2 border border-v-accent/10 relative overflow-hidden group active:scale-95 transition-all"
                      >
                        <div className="aspect-square rounded-lg overflow-hidden mb-1.5">
                          <img
                            src={plant.image || "/placeholder-plant.jpg"}
                            className="w-full h-full object-cover opacity-80 group-hover:scale-110 transition-transform"
                          />
                        </div>

                        <p className="text-[9px] font-black text-v-light truncate">
                          {plant.nickname}
                        </p>

                        {(plant.location_name || plant.common_name) && (
                          <p className="text-[8px] text-v-accent/50 font-bold uppercase truncate">
                            {plant.location_name || plant.common_name}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="space-y-3 pb-20">
                  <h3 className="text-[9px] font-black text-v-accent/40 uppercase tracking-widest px-1">
                    Le tue Stanze
                  </h3>

                  {locations.map((loc) => {
                    const locId = Number(loc.id);
                    const isOpen = expandedLocationId === locId;
                    const roomPlants = plantsByLocation.get(locId) ?? [];

                    return (
                      <div
                        key={loc.id}
                        className="bg-v-surface/40 rounded-2xl border border-v-accent/5 overflow-hidden"
                      >
                        <div className="flex items-center justify-between p-3">
                          <div className="flex items-center space-x-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-v-surface flex items-center justify-center text-v-accent">
                              <i className={`fa-solid ${loc.icon} text-sm`}></i>
                            </div>

                            <div className="min-w-0">
                              <h4 className="text-sm font-black text-v-light truncate">{loc.name}</h4>
                              <p className="text-[8px] text-v-accent/45 font-bold uppercase">
                                {roomPlants.length} {roomPlants.length === 1 ? "pianta" : "piante"}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedLocationId((prev) => (prev === locId ? null : locId))
                            }
                            className="w-8 h-8 rounded-lg bg-v-dark/30 border border-v-accent/10 flex items-center justify-center text-v-accent flex-shrink-0"
                            aria-label={isOpen ? `Chiudi ${loc.name}` : `Apri ${loc.name}`}
                          >
                            <i
                              className={`fa-solid ${
                                isOpen ? "fa-chevron-down" : "fa-chevron-right"
                              } text-xs`}
                            ></i>
                          </button>
                        </div>

                        {isOpen && (
                          <div className="px-3 pb-3 border-t border-v-accent/5">
                            {roomPlants.length === 0 ? (
                              <div className="pt-3">
                                <p className="text-[9px] text-v-accent/45 font-bold uppercase tracking-widest">
                                  Nessuna pianta in questa stanza
                                </p>
                              </div>
                            ) : (
                              <div className="grid grid-cols-3 gap-2 pt-3">
                                {roomPlants.map((plant) => (
                                  <button
                                    key={plant.id}
                                    onClick={() => openPlantDetail(Number(plant.id))}
                                    className="text-left bg-v-dark/40 rounded-xl p-2 border border-v-accent/10 relative overflow-hidden group active:scale-95 transition-all"
                                  >
                                    <div className="aspect-square rounded-lg overflow-hidden mb-1.5">
                                      <img
                                        src={plant.image || "/placeholder-plant.jpg"}
                                        className="w-full h-full object-cover opacity-80 group-hover:scale-110 transition-transform"
                                      />
                                    </div>

                                    <p className="text-[9px] font-black text-v-light truncate">
                                      {plant.nickname}
                                    </p>

                                    {plant.common_name && (
                                      <p className="text-[8px] text-v-accent/50 font-bold uppercase truncate">
                                        {plant.common_name}
                                      </p>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </section>
              </div>
            )}

            {subTab === 'AGENDA' && (
              <div className="space-y-3 pb-20">
                {subTab === 'AGENDA' && (
                <div className="space-y-4 pb-20">
                  <div className="bg-v-surface/20 p-4 rounded-3xl border border-v-accent/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-[10px] font-black text-v-accent uppercase tracking-widest">
                          Genera attività
                        </h3>
                        <p className="text-[9px] text-v-accent/50">
                          Crea le attività per il periodo scelto.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {[7, 30, 90].map((days) => (
                        <button
                          key={days}
                          onClick={() => handleGenerateAgenda(days as 7 | 30 | 90)}
                          disabled={agendaGenerating !== null}
                          className="py-3 rounded-xl bg-v-accent text-v-dark text-[9px] font-black uppercase tracking-widest disabled:opacity-60"
                        >
                          {agendaGenerating === days ? "..." : `${days}g`}
                        </button>
                      ))}
                    </div>

                    {agendaGenerateMessage && (
                      <p className="text-[9px] font-bold text-v-accent/70">
                        {agendaGenerateMessage}
                      </p>
                    )}
                  </div>

                  {agendaLoading && (
                    <p className="text-xs text-v-accent/60">Caricamento agenda…</p>
                  )}

                  {!agendaLoading && agendaError && (
                    <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-[10px] font-bold text-red-300">
                      {agendaError}
                    </div>
                  )}

                  {!agendaLoading && !agendaError && agendaTasks.length === 0 && (
                    <div className="opacity-60 text-center py-10">
                      <i className="fa-solid fa-list-check text-3xl text-v-accent mb-3"></i>
                      <p className="text-[10px] font-black uppercase tracking-widest text-v-light">
                        Nessuna attività in agenda
                      </p>
                    </div>
                  )}

                  {!agendaLoading && agendaTasks.length > 0 && (
                    <div className="space-y-3">
                      {agendaTasks.map(task => (
                        <div
                          key={task.id}
                          className="p-4 rounded-2xl bg-v-surface border border-v-accent/5 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start space-x-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-v-dark flex items-center justify-center text-v-accent flex-shrink-0">
                                <i className={`fa-solid ${agendaTaskIcon(task.task_type)} text-lg`}></i>
                              </div>

                              <div className="min-w-0">
                                <p className="font-black text-xs text-v-light">
                                  {task.title}
                                </p>
                                <p className="text-[9px] font-bold text-v-accent/60 uppercase">
                                  {task.plant_name || "Pianta"}
                                </p>
                                {task.reason && (
                                  <p className="text-[9px] text-v-accent/50 mt-1">
                                    {task.reason}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="text-right flex-shrink-0">
                              <p className="text-[8px] font-black uppercase tracking-widest text-v-accent/60">
                                {agendaStatusLabel(task.status)}
                              </p>
                              <p className="text-[8px] text-v-accent/40 font-bold uppercase">
                                {formatAgendaDate(task.snoozed_until || task.due_date)}
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAgendaComplete(task)}
                              className="flex-1 bg-v-accent text-v-dark py-2 rounded-xl text-[8px] font-black uppercase"
                            >
                              Fatto
                            </button>

                            <button
                              onClick={() => handleAgendaSnooze(task, 2)}
                              className="flex-1 bg-v-dark/30 border border-v-accent/10 text-v-accent py-2 rounded-xl text-[8px] font-black uppercase"
                            >
                              +2 giorni
                            </button>

                            <button
                              onClick={() => handleAgendaSkip(task)}
                              className="flex-1 bg-v-dark/30 border border-v-accent/10 text-v-accent py-2 rounded-xl text-[8px] font-black uppercase"
                            >
                              Salta
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              </div>
            )}
            {subTab === 'HISTORY' && (
              
                <div className="space-y-3 pb-20">
                  <div className="bg-v-surface/20 p-4 rounded-3xl border border-v-accent/5 space-y-3">
                    <div>
                      <h3 className="text-[10px] font-black text-v-accent uppercase tracking-widest">
                        Filtri diario
                      </h3>
                      <p className="text-[9px] text-v-accent/50">
                        Mostra solo le attività completate da agenda che ti interessano.
                      </p>
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                      {[
                        { id: "ALL", label: "Tutte" },
                        { id: "WATERED", label: "Annaffiature" },
                        { id: "FERTILIZED", label: "Concimazioni" },
                        { id: "CHECKED", label: "Controlli" },
                        { id: "TREATED", label: "Trattamenti" },
                        { id: "PRUNED", label: "Potature" },
                        { id: "REPOTTED", label: "Rinvasi" },
                      ].map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setHistoryTypeFilter(item.id as HistoryTypeFilter)}
                          className={`px-3 py-2 rounded-full text-[8px] font-black uppercase tracking-widest border whitespace-nowrap ${
                            historyTypeFilter === item.id
                              ? "bg-v-accent text-v-dark border-v-accent"
                              : "bg-v-dark/30 text-v-accent border-v-accent/10"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    <div>
                      <select
                        value={historyPlantFilter ?? ""}
                        onChange={(e) =>
                          setHistoryPlantFilter(e.target.value ? Number(e.target.value) : null)
                        }
                        className="w-full bg-v-dark/30 rounded-dex-lg px-4 py-3 text-xs outline-none border border-v-accent/10 text-v-light focus:border-v-accent/40 transition-all"
                      >
                        <option value="">Tutte le piante</option>
                        {userPlants.map((plant) => (
                          <option key={plant.id} value={plant.id}>
                            {plant.nickname}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {historyLoading && (
                    <p className="text-xs text-v-accent/60">Caricamento diario…</p>
                  )}

                  {!historyLoading && historyError && (
                    <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-[10px] font-bold text-red-300">
                      {historyError}
                    </div>
                  )}

                  {!historyLoading && !historyError && historyItems.length === 0 && (
                    <div className="opacity-60 text-center py-10">
                      <i className="fa-solid fa-book-open text-3xl text-v-accent mb-3"></i>
                      <p className="text-[10px] font-black uppercase tracking-widest text-v-light">
                        Nessuna attività registrata
                      </p>
                    </div>
                  )}

                  {!historyLoading && historyItems.length > 0 && historyItems.map(item => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-v-surface border border-v-accent/5 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-v-dark flex items-center justify-center text-v-accent flex-shrink-0">
                          <i className={`fa-solid ${eventIcon(item.event_type)} text-lg`}></i>
                        </div>

                        <div className="min-w-0">
                          <p className="font-black text-xs text-v-light">
                            {eventLabel(item.event_type)}
                          </p>
                          <p className="text-[9px] font-bold text-v-accent/60 uppercase truncate">
                            {item.plant_name || "Pianta"}
                          </p>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <p className="text-[8px] font-black uppercase tracking-widest text-v-accent/60">
                          {formatAgendaDate(item.event_date)}
                        </p>
                        <p className="text-[8px] text-v-accent/40 font-bold uppercase">
                          da agenda
                        </p>
                      </div>
                    </div>

                    {(item.product_name || item.notes) && (
                      <div className="space-y-1">
                        {item.product_name && (
                          <p className="text-[9px] text-v-light">
                            <b>Prodotto:</b> {item.product_name}
                          </p>
                        )}

                        {item.notes && (
                          <p className="text-[9px] text-v-accent/50">
                            {item.notes}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                </div>
              )}
          </div>
        )}

        {activeTab === 'SHOP' && (
          <div className="p-6 space-y-8 pb-40 fade-up">
            <header>
              <h1 className="text-3xl font-black text-v-light uppercase tracking-tighter">Shop</h1>
              <p className="text-v-accent/60 font-medium italic text-xs">Cura selezionata per le tue piante.</p>
                          <button
              onClick={() => {
                // per ora: solo refresh o apri drawer carrello più avanti
                setActiveTab("ORDERS");
                refreshCartCount();
              }}
              className="relative w-9 h-9 rounded-xl bg-v-surface flex items-center justify-center text-v-accent border border-v-accent/10"
            >
              <i className="fa-solid fa-cart-shopping text-xs"></i>

              {cartCount > 0 && (
                 <span
                  className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-v-accent text-v-dark text-[10px] font-black flex items-center justify-center transition-transform duration-200 ${
                    cartBump ? "scale-125" : "scale-100"
                  }`}
                >
                  {cartCount}
                </span>
              )}
            </button>
            </header>
            <div className="grid grid-cols-2 gap-4">
              {products.map(p => (
                <div key={p.id} className="bg-v-card p-4 rounded-dex-lg border border-v-accent/5 space-y-4 group">
                  <div className="aspect-square rounded-dex-md overflow-hidden relative">
                    <img src={p.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    <div className="absolute top-2 right-2 bg-v-dark/80 px-2.5 py-1 rounded-lg text-[10px] font-black text-v-accent">€{p.price.toFixed(2)}</div>
                  </div>
                  <h4 className="text-[11px] font-black text-v-light leading-tight h-8 line-clamp-2">{p.name}</h4>
                  <button
                    onClick={async () => {
                      try {
                        refreshCartCount();
                        const res = await fetch("/api/cart/items", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ productId: p.id, qty: 1 }),
                        });

                        if (!res.ok) {
                          const err = await res.json().catch(() => ({}));
                          console.error("Add to cart failed:", res.status, err);
                          return;
                        }

                        // opzionale: qui puoi aggiornare un badge carrello o mostrare un toast
                        // console.log("Added to cart", await res.json());
                      } catch (e) {
                        console.error("Network error:", e);
                      }
                    }}
                    className="w-full bg-v-accent/10 text-v-accent border border-v-accent/20 py-2 rounded-dex-sm text-[9px] font-black uppercase"
                  >
                    Aggiungi
                </button>
                
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'DISCOVER' && (
          <div className="h-full">
            {dexView === 'HOME' && renderHome()}
            {dexView === 'SCENARIO' && renderScenario()}
            {dexView === 'RESULTS' && renderResults()}
          </div>
        )}

{activeTab === 'ORDERS' && (
  <div className="p-6 space-y-6 pb-40 fade-up">
    <div className="flex space-x-1.5 bg-v-surface/40 p-1.5 rounded-dex-lg border border-v-accent/5">
      <button
        onClick={() => setOrdersMode("CART_FLOW")}
        className={`flex-1 py-2 text-[9px] font-black uppercase rounded-dex-md transition-all ${
          ordersMode === "CART_FLOW" ? "bg-v-accent text-v-dark shadow-lg" : "text-v-accent/40"
        }`}
      >
        Carrello
      </button>
      <button
        onClick={() => setOrdersMode("MY_ORDERS")}
        className={`flex-1 py-2 text-[9px] font-black uppercase rounded-dex-md transition-all ${
          ordersMode === "MY_ORDERS" ? "bg-v-accent text-v-dark shadow-lg" : "text-v-accent/40"
        }`}
      >
        I miei ordini
      </button>
    </div>

    {ordersMode === "CART_FLOW" && (
      <>
        {ordersView === "CART" && (
          <>
            <header className="flex items-center justify-between">
              <h1 className="text-2xl font-black text-v-light uppercase tracking-tighter">Carrello</h1>
              <button
                onClick={() => setActiveTab("SHOP")}
                className="px-4 py-2 rounded-xl bg-v-surface/40 border border-v-accent/10 text-[9px] font-black uppercase text-v-accent"
              >
                Continua shopping
              </button>
            </header>

            {cartLoading && <p className="text-xs text-v-accent/60">Caricamento…</p>}

            {!cartLoading && cart.items.length === 0 && (
              <div className="opacity-60 text-center py-10">
                <i className="fa-solid fa-cart-shopping text-3xl text-v-accent mb-3"></i>
                <p className="text-[10px] font-black uppercase tracking-widest text-v-light">Carrello vuoto</p>
              </div>
            )}

            {!cartLoading && cart.items.length > 0 && (
              <>
                <div className="space-y-3">
                  {cart.items.map((it: any) => (
                    <div
                      key={it.productId}
                      className="bg-v-surface/30 border border-v-accent/10 rounded-2xl p-3 flex items-center space-x-3"
                    >
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-v-dark flex-shrink-0">
                        <img src={it.image} className="w-full h-full object-cover opacity-90" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-black text-v-light truncate">{it.name}</p>
                        <p className="text-[9px] font-bold text-v-accent/60 uppercase">
                          €{Number(it.unitPrice).toFixed(2)}
                        </p>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={async () => {
                            await changeCartItem(it.productId, -1);
                            await refreshCart();
                            await refreshCartCount();
                          }}
                          className="w-8 h-8 rounded-xl bg-v-dark/40 border border-v-accent/10 text-v-accent flex items-center justify-center"
                        >
                          <i className="fa-solid fa-minus text-[10px]"></i>
                        </button>

                        <div className="w-8 text-center text-[10px] font-black text-v-light">
                          {it.qty}
                        </div>

                        <button
                          onClick={async () => {
                            await changeCartItem(it.productId, +1);
                            await refreshCart();
                            await refreshCartCount();
                          }}
                          className="w-8 h-8 rounded-xl bg-v-dark/40 border border-v-accent/10 text-v-accent flex items-center justify-center"
                        >
                          <i className="fa-solid fa-plus text-[10px]"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-4 space-y-3">
                  <div className="flex items-center justify-between bg-v-surface/20 border border-v-accent/10 rounded-2xl p-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-v-accent/60">
                      Totale
                    </span>
                    <span className="text-sm font-black text-v-light">
                      €{Number(cart.total).toFixed(2)}
                    </span>
                  </div>

                  <button
                    onClick={async () => {
                      await refreshCart();
                      setOrdersView("CHECKOUT");
                    }}
                    className="w-full bg-v-accent text-v-dark py-4 rounded-dex-lg text-xs font-black uppercase tracking-widest shadow-xl shadow-v-accent/10 active:scale-95 transition-all"
                  >
                    Procedi all’acquisto
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {ordersView === "CHECKOUT" && (
          <>
            <header className="flex items-center space-x-4">
              <button
                onClick={() => setOrdersView("CART")}
                className="w-10 h-10 rounded-xl bg-v-surface flex items-center justify-center text-v-accent border border-v-accent/10"
              >
                <i className="fa-solid fa-chevron-left"></i>
              </button>
              <h2 className="text-2xl font-black text-v-light uppercase tracking-tighter">Checkout</h2>
            </header>

            <div className="bg-v-surface/20 border border-v-accent/10 rounded-3xl p-4 space-y-3">
              <h3 className="text-[9px] font-black text-v-accent/40 uppercase tracking-widest">
                Riepilogo ordine
              </h3>

              <div className="space-y-2">
                {cart.items.map((it: any) => (
                  <div key={it.productId} className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-v-light truncate">{it.name}</p>
                      <p className="text-[9px] font-bold text-v-accent/60 uppercase">
                        {it.qty} × €{Number(it.unitPrice).toFixed(2)}
                      </p>
                    </div>
                    <p className="text-[10px] font-black text-v-light">
                      €{Number(it.qty * it.unitPrice).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-v-accent/10 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-v-accent/60">
                  Totale
                </span>
                <span className="text-sm font-black text-v-light">
                  €{Number(cart.total).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="bg-v-surface/20 border border-v-accent/10 rounded-3xl p-4 space-y-3">
              <h3 className="text-[9px] font-black text-v-accent/40 uppercase tracking-widest">
                Modalità di ritiro
              </h3>

              <div className="rounded-2xl border border-v-accent/10 bg-v-dark/20 p-4">
                <p className="text-[10px] font-black text-v-light uppercase">Ritiro in vivaio</p>
                <p className="text-[9px] text-v-accent/60 mt-1">
                  Verrai contattato dal vivaio quando l’ordine sarà pronto.
                </p>
              </div>

              <div className="rounded-2xl border border-v-accent/10 bg-v-dark/20 p-4">
                <p className="text-[10px] font-black text-v-light uppercase">Pagamento</p>
                <p className="text-[9px] text-v-accent/60 mt-1">
                  Pagamento al ritiro in vivaio
                </p>
              </div>
            </div>

            <div className="bg-v-surface/20 border border-v-accent/10 rounded-3xl p-4 space-y-3">
              <h3 className="text-[9px] font-black text-v-accent/40 uppercase tracking-widest">
                Contatti ordine
              </h3>

              <input
                value={checkoutForm.customerName}
                onChange={(e) =>
                  setCheckoutForm((prev) => ({ ...prev, customerName: e.target.value }))
                }
                className="w-full bg-v-dark/30 rounded-dex-lg px-4 py-3 text-xs outline-none border border-v-accent/10 text-v-light placeholder:text-v-accent/30 focus:border-v-accent/40 transition-all"
                placeholder="Nome e cognome"
              />

              <input
                value={checkoutForm.customerPhone}
                onChange={(e) =>
                  setCheckoutForm((prev) => ({ ...prev, customerPhone: e.target.value }))
                }
                className="w-full bg-v-dark/30 rounded-dex-lg px-4 py-3 text-xs outline-none border border-v-accent/10 text-v-light placeholder:text-v-accent/30 focus:border-v-accent/40 transition-all"
                placeholder="Telefono *"
              />

              <input
                value={checkoutForm.customerEmail}
                onChange={(e) =>
                  setCheckoutForm((prev) => ({ ...prev, customerEmail: e.target.value }))
                }
                className="w-full bg-v-dark/30 rounded-dex-lg px-4 py-3 text-xs outline-none border border-v-accent/10 text-v-light placeholder:text-v-accent/30 focus:border-v-accent/40 transition-all"
                placeholder="Email"
              />

              <textarea
                value={checkoutForm.notes}
                onChange={(e) =>
                  setCheckoutForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                className="w-full min-h-[96px] bg-v-dark/30 rounded-dex-lg px-4 py-3 text-xs outline-none border border-v-accent/10 text-v-light placeholder:text-v-accent/30 focus:border-v-accent/40 transition-all"
                placeholder="Note per il vivaio"
              />

              <p className="text-[9px] text-v-accent/40 font-bold">
                * Il telefono è obbligatorio.
              </p>
            </div>

            {checkoutError && (
              <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-[10px] font-bold text-red-300">
                {checkoutError}
              </div>
            )}

            <button
              onClick={submitOrder}
              disabled={checkoutSubmitting}
              className="w-full bg-v-accent text-v-dark py-4 rounded-dex-lg text-xs font-black uppercase tracking-widest shadow-xl shadow-v-accent/10 active:scale-95 transition-all disabled:opacity-60"
            >
              {checkoutSubmitting ? "Invio ordine..." : "Conferma ordine"}
            </button>
          </>
        )}

        {ordersView === "SUCCESS" && (
          <div className="space-y-6 text-center py-10">
            <div className="w-20 h-20 mx-auto rounded-full bg-v-accent/10 flex items-center justify-center text-v-accent">
              <i className="fa-solid fa-check text-3xl"></i>
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-black text-v-light uppercase">Ordine inviato</h2>
              <p className="text-sm text-v-accent/60">
                Il vivaio riceverà i tuoi contatti per confermare il ritiro.
              </p>
              {createdOrder && (
                <p className="text-[10px] font-black uppercase tracking-widest text-v-light">
                  Codice ordine: {createdOrder.code}
                </p>
              )}
            </div>

            <button
              onClick={async () => {
                setOrdersMode("MY_ORDERS");
                setOrderHistoryFilter("TO_PICK_UP");
                await loadMyOrders();
              }}
              className="w-full bg-v-accent text-v-dark py-4 rounded-dex-lg text-xs font-black uppercase tracking-widest"
            >
              Vedi i miei ordini
            </button>
          </div>
        )}
      </>
    )}

    {ordersMode === "MY_ORDERS" && (
      <>
        <header className="space-y-2">
          <h1 className="text-2xl font-black text-v-light uppercase tracking-tighter">I miei ordini</h1>
          <p className="text-[10px] text-v-accent/60">
            Controlla cosa devi ritirare e cosa hai già ritirato.
          </p>
        </header>

        <div className="flex space-x-1.5 bg-v-surface/40 p-1.5 rounded-dex-lg border border-v-accent/5">
          <button
            onClick={() => setOrderHistoryFilter("TO_PICK_UP")}
            className={`flex-1 py-2 text-[9px] font-black uppercase rounded-dex-md transition-all ${
              orderHistoryFilter === "TO_PICK_UP" ? "bg-v-accent text-v-dark shadow-lg" : "text-v-accent/40"
            }`}
          >
            Da ritirare
          </button>
          <button
            onClick={() => setOrderHistoryFilter("PICKED_UP")}
            className={`flex-1 py-2 text-[9px] font-black uppercase rounded-dex-md transition-all ${
              orderHistoryFilter === "PICKED_UP" ? "bg-v-accent text-v-dark shadow-lg" : "text-v-accent/40"
            }`}
          >
            Ritirati
          </button>
        </div>

        {myOrdersLoading && (
          <p className="text-xs text-v-accent/60">Caricamento ordini…</p>
        )}

        {!myOrdersLoading && myOrdersError && (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-[10px] font-bold text-red-300">
            {myOrdersError}
          </div>
        )}

        {!myOrdersLoading && !myOrdersError && visibleOrders.length === 0 && (
          <div className="opacity-60 text-center py-10">
            <i className="fa-solid fa-receipt text-3xl text-v-accent mb-3"></i>
            <p className="text-[10px] font-black uppercase tracking-widest text-v-light">
              Nessun ordine in questa sezione
            </p>
          </div>
        )}

        {!myOrdersLoading && visibleOrders.length > 0 && (
          <div className="space-y-3">
            {visibleOrders.map((order) => (
              <button
                key={order.id}
                onClick={() => openOrderDetail(order.id)}
                className="w-full text-left bg-v-surface/30 border border-v-accent/10 rounded-2xl p-4 space-y-3 active:scale-[0.99] transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-v-accent">
                      {order.public_code}
                    </p>
                    <p className="text-sm font-black text-v-light">
                      {orderStatusLabel(order.status)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-black text-v-light">
                      €{Number(order.total_amount).toFixed(2)}
                    </p>
                    <p className="text-[9px] text-v-accent/50 font-bold uppercase">
                      {order.items_count} articoli
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[9px] font-bold uppercase text-v-accent/50">
                  <span>{orderDateLabel(order.created_at)}</span>
                  <span className="truncate pl-3">{order.customer_phone}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </>
    )}
  </div>
)}
      </main>
      <AddPlantSheet
        open={addPlantSheet.open}
        species={addPlantSheet.species}
        defaultLocationId={addPlantSheet.defaultLocationId}
        locations={locations}
        onClose={() =>
          setAddPlantSheet({
            open: false,
            species: null,
            defaultLocationId: null,
          })
        }
        onSubmit={handleCreateMyPlant}
      />
      <BottomSheet
  isOpen={selectedPlantLoading || !!selectedPlantDetail || !!selectedPlantError}
  onClose={() => {
    setSelectedPlantDetail(null);
    setSelectedPlantError(null);
  }}
  title="Dettaglio Pianta"
>
  {selectedPlantLoading && (
    <p className="text-xs text-v-accent/60">Caricamento…</p>
  )}

  {!selectedPlantLoading && selectedPlantError && (
    <p className="text-xs text-red-300/80">{selectedPlantError}</p>
  )}

  {!selectedPlantLoading && selectedPlantDetail && (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div className="w-20 h-24 rounded-dex-lg overflow-hidden bg-v-dark/30 flex-shrink-0">
          <img
            src={selectedPlantDetail.image || "/placeholder-plant.jpg"}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-lg font-black text-v-light leading-tight">
            {selectedPlantDetail.nickname}
          </p>

          {selectedPlantDetail.species?.common_name && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-v-accent/70">
              {selectedPlantDetail.species.common_name}
            </p>
          )}

          {selectedPlantDetail.species?.scientific_name && (
            <p className="text-[10px] italic text-v-accent/50">
              {selectedPlantDetail.species.scientific_name}
            </p>
          )}

          {selectedPlantDetail.status && (
            <span className="inline-flex px-2 py-1 rounded-lg bg-v-dark/40 border border-v-accent/10 text-[8px] font-black uppercase tracking-widest text-v-accent">
              {selectedPlantDetail.status}
            </span>
          )}
        </div>
      </div>

      <div className="bg-v-dark/20 rounded-dex-lg p-4 border border-v-accent/10 space-y-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-v-accent/60">
          Dove si trova
        </p>

        {selectedPlantDetail.location && (
          <p className="text-[10px] text-v-light">
            <b>Stanza:</b> {selectedPlantDetail.location.name}
          </p>
        )}

        {selectedPlantDetail.indoor_outdoor && (
          <p className="text-[10px] text-v-light">
            <b>Ambiente:</b> {selectedPlantDetail.indoor_outdoor === "INDOOR" ? "Interno" : "Esterno"}
          </p>
        )}

        {selectedPlantDetail.pot_diameter_cm && (
          <p className="text-[10px] text-v-light">
            <b>Diametro vaso:</b> {selectedPlantDetail.pot_diameter_cm} cm
          </p>
        )}
      </div>

      <div className="bg-v-dark/20 rounded-dex-lg p-4 border border-v-accent/10 space-y-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-v-accent/60">
          Cura base
        </p>

        {wateringMeta && (
          <div className="space-y-1">
            <p className="text-[10px] text-v-light">
              <b>Irrigazione:</b> {wateringMeta.label}
            </p>

            {wateringMeta.hint && (
              <p className="text-[9px] text-v-accent/60 italic">
                {wateringMeta.hint}
              </p>
            )}
          </div>
        )}

        {selectedPlantDetail.species?.watering_trigger_note && (
          <p className="text-[10px] text-v-light">
            <b>Quando bagnare:</b> {selectedPlantDetail.species.watering_trigger_note}
          </p>
        )}

        {selectedPlantDetail.species?.fertilizing_enabled && (
          <p className="text-[10px] text-v-light">
            <b>Concimazione:</b>{" "}
            {selectedPlantDetail.species.fertilizing_month_start && selectedPlantDetail.species.fertilizing_month_end
              ? `da ${selectedPlantDetail.species.fertilizing_month_start} a ${selectedPlantDetail.species.fertilizing_month_end}`
              : "attiva"}
          </p>
        )}

        {selectedPlantDetail.species?.fertilizing_type_note && (
          <p className="text-[10px] text-v-light">
            <b>Tipo concime:</b> {selectedPlantDetail.species.fertilizing_type_note}
          </p>
        )}
      </div>

      <div className="bg-v-dark/20 rounded-dex-lg p-4 border border-v-accent/10 space-y-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-v-accent/60">
          Info base
        </p>

        {selectedPlantDetail.species?.family && (
          <p className="text-[10px] text-v-light">
            <b>Famiglia:</b> {selectedPlantDetail.species.family}
          </p>
        )}

        {selectedPlantDetail.species?.genus && (
          <p className="text-[10px] text-v-light">
            <b>Genere:</b> {selectedPlantDetail.species.genus}
          </p>
        )}

        {selectedPlantDetail.species?.temperature_min_c !== null &&
          selectedPlantDetail.species?.temperature_max_c !== null && (
            <p className="text-[10px] text-v-light">
              <b>Temperatura:</b> {selectedPlantDetail.species.temperature_min_c}°C – {selectedPlantDetail.species.temperature_max_c}°C
            </p>
          )}

        {selectedPlantDetail.user_notes && (
          <p className="text-[10px] text-v-light">
            <b>Note:</b> {selectedPlantDetail.user_notes}
          </p>
        )}
      </div>
    </div>
  )}
</BottomSheet>
        <BottomSheet
          isOpen={!!selectedSpecies}
          onClose={() => setSelectedSpecies(null)}
          title="Dettaglio Pianta"
        >
          {speciesLoading && (
            <p className="text-xs text-v-accent/60">Caricamento…</p>
          )}

          {selectedSpecies && (
            <div className="space-y-3">
              <div className="flex space-x-4">
                <img
                  src={selectedSpecies.image || "https://via.placeholder.com/200?text=No+Image"}
                  className="w-16 h-20 rounded-lg object-cover"
                />
                <div className="min-w-0">
                  <h5 className="font-black text-v-light truncate">
                    {selectedSpecies.commonName || "Senza nome comune"}
                  </h5>
                  <p className="text-[9px] text-v-accent/60 font-bold uppercase tracking-tight italic truncate">
                    {selectedSpecies.scientificName || ""}
                  </p>
                </div>
              </div>

              <div className="text-[10px] text-v-gray space-y-1">
                {selectedSpecies.family && <p><b>Famiglia:</b> {selectedSpecies.family}</p>}
                {selectedSpecies.genus && <p><b>Genere:</b> {selectedSpecies.genus}</p>}
                {selectedSpecies.shortDescription && <p>{selectedSpecies.shortDescription}</p>}
              </div>

              <button
                onClick={() => openAddPlantSheet(selectedSpecies)}
                className="w-full bg-v-accent text-v-dark py-3 rounded-dex-lg text-[10px] font-black uppercase tracking-widest"
              >
                Aggiungi alla collezione
              </button>
            </div>
          )}
        </BottomSheet>
        <BottomSheet
  isOpen={selectedOrderLoading || !!selectedOrder}
  onClose={() => setSelectedOrder(null)}
  title="Dettaglio Ordine"
>
  {selectedOrderLoading && (
    <p className="text-xs text-v-accent/60">Caricamento…</p>
  )}

  {selectedOrder && (
    <div className="space-y-4">
      <div className="bg-v-dark/20 rounded-dex-lg p-4 border border-v-accent/10 space-y-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-v-accent">
          {selectedOrder.public_code}
        </p>
        <p className="text-sm font-black text-v-light">
          {orderStatusLabel(selectedOrder.status)}
        </p>
        <p className="text-[9px] text-v-accent/60 font-bold uppercase">
          {orderDateLabel(selectedOrder.created_at)}
        </p>
      </div>

      <div className="bg-v-dark/20 rounded-dex-lg p-4 border border-v-accent/10 space-y-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-v-accent/60">
          Contatti
        </p>
        {selectedOrder.customer_name && (
          <p className="text-[10px] text-v-light"><b>Nome:</b> {selectedOrder.customer_name}</p>
        )}
        <p className="text-[10px] text-v-light"><b>Telefono:</b> {selectedOrder.customer_phone}</p>
        {selectedOrder.customer_email && (
          <p className="text-[10px] text-v-light"><b>Email:</b> {selectedOrder.customer_email}</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-v-accent/60">
          Articoli
        </p>

        {selectedOrder.items.map((item) => (
          <div
            key={item.id}
            className="bg-v-dark/20 rounded-dex-lg p-3 border border-v-accent/10 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-[10px] font-black text-v-light truncate">
                {item.product_name_snapshot}
              </p>
              <p className="text-[9px] text-v-accent/60 font-bold uppercase">
                {item.qty} × €{Number(item.unit_price).toFixed(2)}
              </p>
            </div>

            <p className="text-[10px] font-black text-v-light">
              €{Number(item.line_total).toFixed(2)}
            </p>
          </div>
        ))}
      </div>

      {selectedOrder.notes && (
        <div className="bg-v-dark/20 rounded-dex-lg p-4 border border-v-accent/10">
          <p className="text-[10px] font-black uppercase tracking-widest text-v-accent/60 mb-1">
            Note
          </p>
          <p className="text-[10px] text-v-light">{selectedOrder.notes}</p>
        </div>
      )}

      <div className="pt-3 border-t border-v-accent/10 flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-v-accent/60">
          Totale
        </span>
        <span className="text-sm font-black text-v-light">
          €{Number(selectedOrder.total_amount).toFixed(2)}
        </span>
      </div>
    </div>
  )}
</BottomSheet>
      {/* Picker Bottom Sheet - Fix for missing children error on Line 497 */}
      <BottomSheet 
        isOpen={pickerOpen.open} 
        onClose={() => setPickerOpen({ open: false, key: null })} 
        title="Seleziona Opzione"
      >
        {pickerOpen.key && (
          <div className="space-y-2">
            {[
              { room: ['Soggiorno', 'Camera', 'Bagno', 'Cucina', 'Balcone', 'Ufficio'] },
              { light: ['Non so', 'Bassa', 'Media', 'Alta'] },
              { difficulty: ['Facile', 'Media', 'Esperta'] },
              { pets: ['No', 'Sì', 'Non importa'] },
              { size: ['Piccola', 'Media', 'Grande'] },
            ].find(o => Object.keys(o)[0] === pickerOpen.key)?.[pickerOpen.key as string]?.map((opt: string) => (
              <button 
                key={opt}
                onClick={() => {
                  setScenario(prev => ({ ...prev, [pickerOpen.key!]: opt }));
                  setPickerOpen({ open: false, key: null });
                }}
                className={`w-full p-4 rounded-dex-lg text-left text-xs font-black uppercase tracking-widest transition-all ${scenario[pickerOpen.key!] === opt ? 'bg-v-accent text-v-dark shadow-lg' : 'bg-v-dark/40 text-v-accent/50 hover:bg-v-dark/60'}`}
              >
                {opt}
              </button>
            ))}
          </div>
)}
      </BottomSheet>

      {/* "Perché è adatta" Drawer - Fix for missing children error on Line 527 */}
      <BottomSheet 
        isOpen={!!selectedResult} 
        onClose={() => setSelectedResult(null)} 
        title="Perché è adatta"
      >
        {selectedResult && (
          <div className="space-y-6">
            <div className="flex space-x-4">
              <img src={selectedResult.entry.image} className="w-16 h-20 rounded-lg object-cover" />
              <div>
                <h5 className="font-black text-v-light">{selectedResult.entry.commonName}</h5>
                <CompatibilityBadge leaves={selectedResult.leaves} label={selectedResult.label} />
              </div>
            </div>
            
            <div className="space-y-3">
              {selectedResult.breakdown.map((f, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-v-dark/20 rounded-lg">
                  <span className="text-[10px] font-bold text-v-gray uppercase">{f.label}</span>
                  <div className="flex items-center space-x-2">
                    {f.hint && <span className="text-[9px] italic text-v-accent/50">{f.hint}</span>}
                    <i className={`fa-solid ${f.status === 'OK' ? 'fa-check text-green-400' : f.status === 'WARN' ? 'fa-triangle-exclamation text-yellow-400' : 'fa-circle-xmark text-red-400'} text-xs`}></i>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 space-y-3">
              <button onClick={() => openAddPlantSheet(selectedResult.entry)} className="w-full bg-v-accent text-v-dark py-4 rounded-dex-lg text-xs font-black uppercase tracking-widest">Aggiungi alla Collezione</button>
              <button onClick={() => setActiveTab('SHOP')} className="w-full bg-v-surface text-v-accent border border-v-accent/20 py-4 rounded-dex-lg text-xs font-black uppercase tracking-widest">Cerca nello Shop</button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* Navigazione Principale */}
      <nav className="fixed bottom-8 left-8 right-8 z-[200] h-20 glass-nav rounded-[2.5rem] border border-v-accent/10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] flex items-center justify-around px-4 max-w-[calc(448px-4rem)] mx-auto">
        <button onClick={() => setActiveTab('COLLECTION')} className={`flex-1 flex flex-col items-center space-y-1.5 transition-all ${activeTab === 'COLLECTION' ? 'text-v-accent' : 'text-v-accent/30'}`}>
          <i className="fa-solid fa-leaf text-xl"></i>
          <span className="text-[8px] font-black uppercase tracking-tighter">Piante</span>
        </button>
        <button onClick={() => setActiveTab('SHOP')} className={`flex-1 flex flex-col items-center space-y-1.5 transition-all ${activeTab === 'SHOP' ? 'text-v-accent' : 'text-v-accent/30'}`}>
          <i className="fa-solid fa-bag-shopping text-xl"></i>
          <span className="text-[8px] font-black uppercase tracking-tighter">Shop</span>
        </button>
        <div className="px-2 transform -translate-y-3">
          <button onClick={() => setIsQuickActionOpen(!isQuickActionOpen)} className="w-14 h-14 rounded-full bg-v-accent flex items-center justify-center text-v-dark shadow-[0_10px_25px_rgba(255,204,179,0.3)] transition-all active:scale-90 active:rotate-45">
            <i className="fa-solid fa-plus text-2xl"></i>
          </button>
        </div>
        <button onClick={() => setActiveTab('DISCOVER')} className={`flex-1 flex flex-col items-center space-y-1.5 transition-all ${activeTab === 'DISCOVER' ? 'text-v-accent' : 'text-v-accent/30'}`}>
          <i className="fa-solid fa-compass text-xl"></i>
          <span className="text-[8px] font-black uppercase tracking-tighter">Discover</span>
        </button>
        <button onClick={() => setActiveTab('ORDERS')} className={`flex-1 flex flex-col items-center space-y-1.5 transition-all ${activeTab === 'ORDERS' ? 'text-v-accent' : 'text-v-accent/30'}`}>
          <i className="fa-solid fa-receipt text-xl"></i>
          <span className="text-[8px] font-black uppercase tracking-tighter">Ordini</span>
        </button>
      </nav>

      {/* Quick Action Overlay (Simulated) */}
      <div className={`fixed inset-0 z-[250] bg-v-dark/95 backdrop-blur-2xl transition-all duration-500 ${isQuickActionOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`} onClick={() => setIsQuickActionOpen(false)}>
         <div className="absolute bottom-40 left-8 right-8 space-y-3">
            {[
              { label: 'Aggiungi Pianta', icon: 'fa-camera', color: 'bg-v-accent' },
              { label: 'Diagnosi IA', icon: 'fa-microchip', color: 'bg-v-surface' },
            ].map((action, i) => (
              <div key={i} className="bg-v-surface/80 p-5 rounded-dex-lg border border-v-accent/10 flex items-center space-x-4 active:scale-95 transition-all" onClick={() => { if(i===0) {setActiveTab('DISCOVER'); setDexView('SCENARIO'); setIsQuickActionOpen(false);}}}>
                 <div className={`w-10 h-10 rounded-full ${action.color} flex items-center justify-center text-v-dark`}><i className={`fa-solid ${action.icon}`}></i></div>
                 <span className="text-xs font-black uppercase tracking-widest text-v-light">{action.label}</span>
              </div>
            ))}
         </div>
      </div>
    </div>
  );
};

export default B2CApp;
