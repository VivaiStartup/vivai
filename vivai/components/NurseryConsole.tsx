
import React, { useState, useMemo , useEffect } from 'react';
import {
  getNurseryOrders,
  getNurseryOrder,
  updateNurseryOrderStatus,
  type NurseryOrderCard,
  type NurseryOrderDetail
} from "../services/nurseryOrderService";
import { 
  User,  Listing, ListingStatus, ListingType, Variant, 
 DashboardStats, Recommendation, 
  TrendItem, CatalogHealth 
} from '../types';
import { MOCK_ORDERS } from '../mockData';
import { 
  getNurseryListings,
  createNurseryListing,
  updateNurseryListing,
  patchNurseryListingStatus,
  type NurseryListingPayload
} from "../services/nurseryCatalogService";import { searchPlantSpecies, type PlantSpeciesOption } from "../services/plantSpeciesService";
import { getInvoices, extractInvoice, InvoiceRecord } from "../services/invoiceService";


interface NurseryConsoleProps {
  user: User;
}

type EditableVariant = Variant & {
  sku?: string;
  stock?: number;
};

type EditableListing = Listing & {
  plantSpeciesId?: number | null;
  plantSpecies?: PlantSpeciesOption | null;
  imageMode?: 'CUSTOM' | 'SPECIES';
  speciesImageUrl?: string | null;
  effectiveMainImage?: string | null;
  stockTotal?: number;
  variants: EditableVariant[];
};

const NO_IMAGE = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="100%" height="100%" fill="%23151a18"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23cbb8a3" font-family="Arial" font-size="18">No image</text></svg>';

type CatalogListingStatus = "ACTIVE" | "DRAFT" | "OUT_OF_STOCK";

const CATALOG_STATUS_OPTIONS: Array<{
  value: CatalogListingStatus;
  label: string;
}> = [
  { value: "ACTIVE", label: "Attivo" },
  { value: "DRAFT", label: "Bozza" },
  { value: "OUT_OF_STOCK", label: "Esaurito" },
];


// Mock esteso per il Catalogo
const MOCK_LISTINGS: Listing[] = [
  {
    id: 'l1',
    nursery_id: 'n1',
    type: 'PLANT',
    title: 'Monstera Deliciosa Premium',
    category: 'Piante da Interno',
    status: 'ACTIVE',
    mainImage: 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?q=80&w=200&h=200&auto=format&fit=crop',
    sellerImages: [],
    shortDescription: 'Splendido esemplare di Monstera con foglie fenestrate.',
    longDescription: '',
    qualityScore: 85,
    attributes: { light: 'MEDIA', water: 'MEDIA', petSafe: false, difficulty: 'FACILE' },
    variants: [
      { id: 'v1', sku: 'MON-12', label: 'Vaso 12cm', price: 18.50, stock: 12, low_stock_threshold: 5 },
      { id: 'v2', sku: 'MON-20', label: 'Vaso 20cm', price: 34.00, stock: 4, low_stock_threshold: 2 }
    ]
  },
  {
    id: 'l2',
    nursery_id: 'n1',
    type: 'PRODUCT',
    title: 'Concime Organico Universale',
    category: 'Cura e Nutrizione',
    brand: 'GreenLife',
    status: 'ACTIVE',
    mainImage: 'https://images.unsplash.com/photo-1585314062340-f1a5a7c9328d?q=80&w=200&h=200&auto=format&fit=crop',
    sellerImages: [],
    shortDescription: 'Fertilizzante 100% naturale per ogni tipo di pianta.',
    longDescription: '',
    qualityScore: 45,
    attributes: {},
    variants: [
      { id: 'v3', sku: 'FERT-1L', label: 'Flacone 1L', price: 12.90, stock: 45, low_stock_threshold: 10 }
    ]
  }
];

const MOCK_STATS: DashboardStats = {
  salesWeekly: 1420.50,
  salesGrowth: 12.4,
  conversionRate: 3.2,
  customerSatisfaction: 4.9,
  funnel: { views: 1240, carts: 84, purchases: 38 }
};



const MOCK_INVOICES = [
  {
    id: "F001",
    type: "VENDITA",
    partner: "Cliente Mario Rossi",
    date: "2026-03-20",
    total: 240.50
  },
  {
    id: "F002",
    type: "ACQUISTO",
    partner: "Fornitore Terricci Spa",
    date: "2026-03-18",
    total: 120.00
  }
];



const MOCK_RECS: Recommendation[] = [
  { id: 'r1', title: 'Carica foto reali', reason: 'Le tue top 3 piante hanno solo foto stock. Le foto reali aumentano la fiducia del 25%.', impact: 'HIGH', cta: 'Vai al Catalogo', actionType: 'CATALOG' },
  { id: 'r2', title: 'Soglia Stock', reason: 'La Monstera Deliciosa (Vaso 12cm) è sotto la soglia minima (2 pezzi).', impact: 'MEDIUM', cta: 'Aggiorna Stock', actionType: 'STOCK' },
  { id: 'r3', title: 'Feedback Clienti', reason: 'Hai 2 nuovi feedback positivi. Rispondi per aumentare il tuo ranking.', impact: 'LOW', cta: 'Vedi Recensioni', actionType: 'ORDERS' }
];

const MOCK_TRENDS_MINE: TrendItem[] = [
  { id: 't1', name: 'Monstera Deliciosa', metric: '+15% visite', stock: 2, tip: 'Ripristina stock' },
  { id: 't2', name: 'Concime Universale', metric: 'Best Seller', stock: 45, tip: 'Ottima performance' }
];

const MOCK_TRENDS_PLATFORM: TrendItem[] = [
  { id: 'p1', name: 'Pilea Peperomioides', metric: 'Top Search', stock: 0, tip: 'Manca nel tuo catalogo' },
  { id: 'p2', name: 'Vasi in Terracotta', metric: 'Trending', stock: 12, tip: 'Sotto la media prezzo' }
];

const MOCK_HEALTH: CatalogHealth = { realPhotos: 80, attributes: 45, descriptions: 95, variants: 100 };

const NurseryConsole: React.FC<NurseryConsoleProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'CATALOG' | 'ORDERS' | 'INVOICES'>('DASHBOARD');
  const [orderSegment, setOrderSegment] = useState<'ALL' | 'PREPARE' | 'PICKUP' | 'DONE'>('ALL');
  const [orders, setOrders] = useState<NurseryOrderCard[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
const [openStatusMenuId, setOpenStatusMenuId] = useState<string | null>(null);
const [statusUpdatingListingId, setStatusUpdatingListingId] = useState<string | null>(null);


const [selectedOrder, setSelectedOrder] = useState<NurseryOrderDetail | null>(null);
const [selectedOrderLoading, setSelectedOrderLoading] = useState(false);
const [orderUpdatingStatus, setOrderUpdatingStatus] = useState(false);
  const [trendTab, setTrendTab] = useState<'MINE' | 'PLATFORM'>('MINE');
  
  const [listings, setListings] = useState<EditableListing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingsError, setListingsError] = useState<string | null>(null);

  const [filterType, setFilterType] = useState<'ALL' | 'PLANT' | 'PRODUCT'>('ALL');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [editingListing, setEditingListing] = useState<EditableListing | null>(null);

  const [inlineEditingStock, setInlineEditingStock] = useState<{variantId: string, value: string} | null>(null);
  const [inlineEditingPrice, setInlineEditingPrice] = useState<{variantId: string, value: string} | null>(null);

  const [invoiceSegment, setInvoiceSegment] = useState<'ACQUISTO' | 'VENDITA'>('VENDITA');
  const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Set<number>>(new Set());
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [invoiceUploading, setInvoiceUploading] = useState(false);
  const [speciesQuery, setSpeciesQuery] = useState('');
  const [speciesResults, setSpeciesResults] = useState<PlantSpeciesOption[]>([]);
  const [speciesLoading, setSpeciesLoading] = useState(false);
  const [speciesError, setSpeciesError] = useState<string | null>(null);

const toggleInvoiceRow = (invoiceId: number) => {
  setExpandedInvoiceIds(prev => {
    const next = new Set(prev);
    if (next.has(invoiceId)) next.delete(invoiceId);
    else next.add(invoiceId);
    return next;
  });
};



const handleChangeListingStatus = async (
  listingId: string,
  nextStatus: CatalogListingStatus
) => {
  const currentStatus = listings.find(l => l.id === listingId)?.status as CatalogListingStatus | undefined;

  if (!currentStatus || currentStatus === nextStatus) {
    setOpenStatusMenuId(null);
    return;
  }

  setStatusUpdatingListingId(listingId);
  setOpenStatusMenuId(null);

  // optimistic update
  setListings(prev =>
    prev.map(l =>
      l.id === listingId ? { ...l, status: nextStatus } : l
    )
  );

  try {
    await patchNurseryListingStatus(listingId, nextStatus);
  } catch (e: any) {
    // rollback
    setListings(prev =>
      prev.map(l =>
        l.id === listingId ? { ...l, status: currentStatus } : l
      )
    );
    alert(e?.message ?? "Errore aggiornamento stato listing");
  } finally {
    setStatusUpdatingListingId(null);
  }
};

  const handleInvoiceFileUpload = async (file: File) => {
  try {
    setInvoiceUploading(true);
    setInvoicesError(null);

    const saved = await extractInvoice(file, invoiceSegment);

    setInvoices(prev => [saved, ...prev]);
  } catch (e: any) {
    setInvoicesError(e?.message ?? "Errore upload fattura");
    alert(e?.message ?? "Errore upload fattura");
  } finally {
    setInvoiceUploading(false);
  }
};


useEffect(() => {
  if (!openStatusMenuId) return;

  const closeMenu = () => setOpenStatusMenuId(null);
  window.addEventListener("click", closeMenu);

  return () => window.removeEventListener("click", closeMenu);
}, [openStatusMenuId]);
useEffect(() => {
  if (activeTab !== "INVOICES") return;

  let alive = true;

  (async () => {
    try {
      setInvoicesLoading(true);
      setInvoicesError(null);
      const data = await getInvoices(invoiceSegment);
      if (alive) setInvoices(data);
    } catch (e: any) {
      if (alive) setInvoicesError(e?.message ?? "Errore caricamento fatture");
    } finally {
      if (alive) setInvoicesLoading(false);
    }
  })();

  return () => {
    alive = false;
  };
}, [activeTab, invoiceSegment]);

useEffect(() => {
  if (activeTab !== "CATALOG") return;
  let alive = true;
  (async () => {
    try {
      setListingsLoading(true);
      setListingsError(null);
      const data = await getNurseryListings(filterType);
      if (alive) setListings(data);
    } catch (e: any) {
      if (alive) setListingsError(e?.message ?? "Errore catalogo");
    } finally {
      if (alive) setListingsLoading(false);
    }
  })();
  return () => { alive = false; };
}, [activeTab, filterType]);

useEffect(() => {
  if (!editingListing) {
    setSpeciesQuery('');
    setSpeciesResults([]);
    setSpeciesError(null);
    return;
  }

  if (editingListing.plantSpecies) {
    const label = editingListing.plantSpecies.commonName || editingListing.plantSpecies.commercialName || editingListing.plantSpecies.scientificName;
    setSpeciesQuery(label);
  } else {
    setSpeciesQuery('');
  }
  setSpeciesResults([]);
  setSpeciesError(null);
}, [editingListing?.id, editingListing?.plantSpeciesId]);

useEffect(() => {
  const q = speciesQuery.trim();
  if (!editingListing) return;
  if (q.length < 2) {
    setSpeciesResults([]);
    setSpeciesError(null);
    return;
  }

  const t = window.setTimeout(async () => {
    try {
      setSpeciesLoading(true);
      setSpeciesError(null);
      const results = await searchPlantSpecies(q, 8);
      setSpeciesResults(results);
    } catch (e: any) {
      setSpeciesError(e?.message ?? 'Errore ricerca specie');
      setSpeciesResults([]);
    } finally {
      setSpeciesLoading(false);
    }
  }, 250);

  return () => window.clearTimeout(t);
}, [speciesQuery, editingListing?.id]);

const orderStatusLabel = (status: string) => {
  switch (status) {
    case "NEW":
      return "Da preparare";
    case "READY_FOR_PICKUP":
      return "Pronto per il ritiro";
    case "COMPLETED":
      return "Completato";
    case "CANCELLED":
      return "Annullato";
    default:
      return status;
  }
};

const orderStatusColor = (status: string) => {
  switch (status) {
    case "NEW":
      return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
    case "READY_FOR_PICKUP":
      return "bg-v-accent/10 text-v-accent border-v-accent/20";
    case "COMPLETED":
      return "bg-green-500/10 text-green-400 border-green-500/20";
    case "CANCELLED":
      return "bg-red-500/10 text-red-400 border-red-500/20";
    default:
      return "bg-v-dark/50 text-v-accent/50 border-v-accent/10";
  }
};

const orderDateLabel = (value: string) =>
  new Date(value).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const nurseryStatusFilter = useMemo(() => {
  switch (orderSegment) {
    case "PREPARE":
      return "NEW";
    case "PICKUP":
      return "READY_FOR_PICKUP";
    case "DONE":
      return "COMPLETED";
    default:
      return undefined;
  }
}, [orderSegment]);

const loadNurseryOrders = async () => {
  try {
    setOrdersLoading(true);
    setOrdersError(null);
    const data = await getNurseryOrders(nurseryStatusFilter);
    setOrders(data);
  } catch (e: any) {
    setOrdersError(e?.message ?? "Errore caricamento ordini");
    setOrders([]);
  } finally {
    setOrdersLoading(false);
  }
};

const openNurseryOrder = async (orderId: number) => {
  try {
    setSelectedOrderLoading(true);
    const data = await getNurseryOrder(orderId);
    setSelectedOrder(data);
  } catch (e: any) {
    alert(e?.message ?? "Errore dettaglio ordine");
    setSelectedOrder(null);
  } finally {
    setSelectedOrderLoading(false);
  }
};

const handleNurseryOrderStatus = async (status: "NEW" | "READY_FOR_PICKUP" | "COMPLETED") => {
  if (!selectedOrder) return;

  try {
    setOrderUpdatingStatus(true);
    await updateNurseryOrderStatus(selectedOrder.id, status);

    const refreshed = await getNurseryOrder(selectedOrder.id);
    setSelectedOrder(refreshed);
    await loadNurseryOrders();
  } catch (e: any) {
    alert(e?.message ?? "Errore aggiornamento stato ordine");
  } finally {
    setOrderUpdatingStatus(false);
  }
};

  const toggleRow = (id: string) => {
    const newRows = new Set(expandedRows);
    if (newRows.has(id)) newRows.delete(id);
    else newRows.add(id);
    setExpandedRows(newRows);
  };

  const handleUpdateStock = (listingId: string, variantId: string, newStock: number) => {
    if (newStock < 0) return;
    setListings(prev => prev.map(l => {
      if (l.id !== listingId) return l;
      return {
        ...l,
        variants: l.variants.map(v => v.id === variantId ? { ...v, stock: newStock, qty: newStock } : v)
      };
    }));
    setInlineEditingStock(null);
  };

  const buildListingProposalFromInvoiceItem = (item: any, inv: InvoiceRecord): Listing => {
  const qty = Number(item.quantity ?? 0) || 0;
  const unitPrice = Number(item.unit_price ?? 0) || 0;

  const rawDescription = (item.description || "").trim();

  // titolo base: descrizione riga o fallback
  const title = rawDescription || "Nuovo prodotto da fattura";

  // euristica minima: se vuoi puoi raffinarla dopo
  const guessedType: "PLANT" | "PRODUCT" =
    /concime|fertilizz|substrato|terriccio|vaso|insetticida|fungicida|prodotto/i.test(rawDescription)
      ? "PRODUCT"
      : "PLANT";

      return {
        id: "", // vuoto => create
        nursery_id: String(user.id_vivaio ?? "1"),
        type: guessedType,
        title,
        category: "Da classificare",
        brand: inv.supplier_name || "",
        status: "DRAFT",
        mainImage: "",
        sellerImages: [],
        shortDescription: inv.invoice_number
          ? `Proposta creata da fattura ${inv.invoice_number}${inv.invoice_date ? ` del ${inv.invoice_date}` : ""}`
          : "Proposta creata da riga fattura",
        longDescription: rawDescription || "",
        qualityScore: 0,
        attributes: {},
        plantSpeciesId: null,
        plantSpecies: null,
        imageMode: 'CUSTOM',
        speciesImageUrl: null,
        effectiveMainImage: null,
        variants: [
          {
            id: `new-${Date.now()}`,
            sku: item.sku || "",
            label: item.unit ? `Conf. ${item.unit}` : "Variante standard",
            price: unitPrice,
            qty: qty,
            stock: qty,
            low_stock_threshold: 0,
          }
        ],
      } as any;
    };


    useEffect(() => {
  if (activeTab !== "ORDERS") return;
  loadNurseryOrders();
}, [activeTab, nurseryStatusFilter]);


const handleProposeInvoiceItemToCatalog = (item: any, inv: InvoiceRecord) => {
  const proposal = buildListingProposalFromInvoiceItem(item, inv);
  setEditingListing(proposal as any);
};

  const handleUpdatePrice = (listingId: string, variantId: string, newPrice: number) => {
    if (newPrice < 0) return;
    setListings(prev => prev.map(l => {
      if (l.id !== listingId) return l;
      return {
        ...l,
        variants: l.variants.map(v => v.id === variantId ? { ...v, price: newPrice } : v)
      };
    }));
    setInlineEditingPrice(null);
  };

  const choosePlantSpecies = (species: PlantSpeciesOption) => {
    setEditingListing(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        plantSpeciesId: species.id,
        plantSpecies: species,
        speciesImageUrl: species.image || null,
        imageMode: prev.imageMode === 'CUSTOM' && prev.mainImage ? 'CUSTOM' : (species.image ? 'SPECIES' : 'CUSTOM'),
      };
    });
    setSpeciesQuery(species.commonName || species.commercialName || species.scientificName);
    setSpeciesResults([]);
  };

  const clearPlantSpecies = () => {
    setEditingListing(prev => prev ? ({
      ...prev,
      plantSpeciesId: null,
      plantSpecies: null,
      speciesImageUrl: null,
      imageMode: 'CUSTOM',
    }) : prev);
    setSpeciesQuery('');
    setSpeciesResults([]);
  };

  const getListingPreviewImage = (listing?: EditableListing | null) => {
    if (!listing) return NO_IMAGE;
    if (listing.imageMode === 'SPECIES' && listing.speciesImageUrl) return listing.speciesImageUrl;
    return listing.mainImage || listing.effectiveMainImage || listing.speciesImageUrl || NO_IMAGE;
  };

  const toListingPayload = (listing: EditableListing): NurseryListingPayload => ({
    type: listing.type as any,
    title: listing.title,
    category: listing.category,
    brand: listing.brand || null,
    status: (listing.status as any) || 'DRAFT',
    mainImage: listing.mainImage || null,
    shortDescription: listing.shortDescription || null,
    longDescription: listing.longDescription || null,
    attributes: listing.attributes || {},
    plantSpeciesId: listing.plantSpeciesId ?? null,
    imageMode: listing.imageMode || 'CUSTOM',
    variants: (listing.variants || []).map((v: any) => ({
      id: typeof v.id === 'number' ? v.id : undefined,
      sku: v.sku || null,
      label: v.label,
      shortDescription: v.short_description || v.shortDescription || null,
      price: Number(v.price || 0),
      qty: Number(v.qty ?? v.stock ?? 0),
      low_stock_threshold: Number(v.low_stock_threshold || 0),
    })),
  });

  const filteredListings = useMemo(() => {
    return listings.filter(l => filterType === 'ALL' || l.type === filterType);
  }, [listings, filterType]);

const StatusPill = ({ status }: { status: string }) => {
  const labels: Record<string, string> = {
    ACTIVE: 'Attivo',
    DRAFT: 'Bozza',
    OUT_OF_STOCK: 'Esaurito',

    NEW: 'Da preparare',
    READY_FOR_PICKUP: 'Pronto per il ritiro',
    COMPLETED: 'Completato',
    CANCELLED: 'Annullato'
  };

  const colors: Record<string, string> = {
    ACTIVE: 'bg-green-500/10 text-green-400 border-green-500/20',
    DRAFT: 'bg-v-accent/10 text-v-accent border-v-accent/20',
    OUT_OF_STOCK: 'bg-red-500/10 text-red-400 border-red-500/20',

    NEW: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    READY_FOR_PICKUP: 'bg-v-accent/10 text-v-accent border-v-accent/20',
    COMPLETED: 'bg-green-500/10 text-green-400 border-green-500/20',
    CANCELLED: 'bg-red-500/10 text-red-400 border-red-500/20'
  };

  return (
    <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase border ${colors[status] || 'bg-v-dark/50 text-v-accent/50 border-v-accent/10'}`}>
      {labels[status] || status}
    </span>
  );
};;

const CatalogStatusControl = ({ listing }: { listing: EditableListing }) => {
  const isOpen = openStatusMenuId === listing.id;
  const isBusy = statusUpdatingListingId === listing.id;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        disabled={isBusy}
        onClick={(e) => {
          e.stopPropagation();
          if (isBusy) return;
          setOpenStatusMenuId(prev => (prev === listing.id ? null : listing.id));
        }}
        className="inline-flex items-center gap-2"
      >
        <StatusPill status={listing.status} />
        <i
          className={`fa-solid ${
            isBusy ? "fa-spinner fa-spin" : "fa-chevron-down"
          } text-[9px] text-v-accent/50 transition-transform ${
            isOpen && !isBusy ? "rotate-180" : ""
          }`}
        ></i>
      </button>

      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full z-30 mt-2 min-w-[170px] overflow-hidden rounded-2xl border border-v-accent/10 bg-v-surface shadow-2xl"
        >
          {CATALOG_STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleChangeListingStatus(listing.id, opt.value)}
              className={`w-full flex items-center justify-between px-3 py-3 text-left hover:bg-v-accent/5 transition-all ${
                listing.status === opt.value ? "bg-v-accent/5" : ""
              }`}
            >
              <StatusPill status={opt.value} />
              {listing.status === opt.value && (
                <i className="fa-solid fa-check text-[10px] text-v-accent"></i>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

  const QualityBadge = ({ score }: { score: number }) => {
    const color = score > 80 ? 'text-green-400' : score > 50 ? 'text-v-accent' : 'text-red-400';
    return (
      <div className="flex items-center space-x-2">
        <div className="w-12 h-1.5 bg-v-dark/50 rounded-full overflow-hidden border border-v-accent/5">
          <div className={`h-full ${score > 80 ? 'bg-green-400' : score > 50 ? 'bg-v-accent' : 'bg-red-400'}`} style={{ width: `${score}%` }}></div>
        </div>
        <span className={`text-[10px] font-black ${color}`}>{score}/100</span>
      </div>
    );
  };

const handleMockExportCSV = () => {
  console.log("Mock export CSV eseguito");
  alert("CSV esportato (mock). In futuro verrà generato e scaricato.");
};

  const renderDashboard = () => (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-v-light tracking-tighter uppercase">Buongiorno, {user.name.split(' ')[0]}</h2>
          <p className="text-v-accent/60 text-sm font-medium italic">Il tuo vivaio sta crescendo bene. Ecco gli insight di oggi.</p>
        </div>
        <div className="flex space-x-4">
           <div className="bg-v-surface/40 p-4 rounded-2xl border border-v-accent/10 min-w-[120px]">
              <p className="text-[9px] font-black text-v-accent uppercase tracking-widest">Vendite 7g</p>
              <p className="text-xl font-black text-v-light mt-1">€{MOCK_STATS.salesWeekly.toFixed(0)}</p>
              <p className="text-[8px] font-bold text-green-400">+{MOCK_STATS.salesGrowth}% vs prec.</p>
           </div>
           <div className="bg-v-surface/40 p-4 rounded-2xl border border-v-accent/10 min-w-[120px]">
              <p className="text-[9px] font-black text-v-accent uppercase tracking-widest">Conversione</p>
              <p className="text-xl font-black text-v-light mt-1">{MOCK_STATS.conversionRate}%</p>
              <p className="text-[8px] font-bold text-v-accent/40">Media: 2.8%</p>
           </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <section className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-black text-v-accent/40 uppercase tracking-widest px-1">Cosa puoi fare oggi</h3>
            <span className="text-[9px] font-bold text-v-accent italic">Analisi completata 5m fa</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {MOCK_RECS.slice(0, 2).map(rec => (
              <div key={rec.id} className="bg-v-surface p-6 rounded-3xl border border-v-accent/15 hover:border-v-accent/30 transition-all flex flex-col justify-between shadow-xl">
                <div>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-4 ${rec.impact === 'HIGH' ? 'bg-v-primary text-v-accent' : 'bg-v-dark text-v-accent'}`}>
                    <i className={`fa-solid ${rec.actionType === 'CATALOG' ? 'fa-camera' : rec.actionType === 'STOCK' ? 'fa-box' : 'fa-star'}`}></i>
                  </div>
                  <h4 className="text-lg font-black text-v-light leading-tight">{rec.title}</h4>
                  <p className="text-xs text-v-accent/60 mt-2 leading-relaxed">{rec.reason}</p>
                </div>
                <button 
                  onClick={() => { if(rec.actionType === 'CATALOG') setActiveTab('CATALOG'); if(rec.actionType === 'STOCK') setActiveTab('CATALOG'); }}
                  className="mt-6 w-full py-3 bg-v-dark/40 border border-v-accent/10 text-v-accent rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-v-accent hover:text-v-dark transition-all">
                  {rec.cta}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="lg:col-span-4 space-y-4">
          <h3 className="text-[10px] font-black text-v-accent/40 uppercase tracking-widest px-1">Percorso di acquisto</h3>
          <div className="bg-v-surface p-6 rounded-3xl border border-v-accent/15 shadow-xl h-full flex flex-col">
             <div className="flex-1 space-y-4">
                {[
                  { label: 'Visite', val: MOCK_STATS.funnel.views, color: 'bg-v-accent/20' },
                  { label: 'Carrelli', val: MOCK_STATS.funnel.carts, color: 'bg-v-accent/40' },
                  { label: 'Acquisti', val: MOCK_STATS.funnel.purchases, color: 'bg-v-accent' }
                ].map((step, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-[10px] font-black text-v-accent/60 uppercase">
                      <span>{step.label}</span>
                      <span className="text-v-light">{step.val}</span>
                    </div>
                    <div className="h-2 w-full bg-v-dark/50 rounded-full overflow-hidden">
                       <div className={`h-full ${step.color}`} style={{ width: `${(step.val / MOCK_STATS.funnel.views) * 100}%` }}></div>
                    </div>
                  </div>
                ))}
             </div>
             <div className="mt-6 p-4 bg-v-dark/30 rounded-2xl border border-v-accent/5">
                <p className="text-[9px] font-black text-v-accent uppercase tracking-widest mb-1">AI Suggestion</p>
                <p className="text-[10px] text-v-accent/70 italic leading-relaxed">Molti carrelli abbandonati sulla Monstera. Offri il ritiro gratuito per sbloccare le vendite?</p>
             </div>
          </div>
        </section>

        <section className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-black text-v-accent/40 uppercase tracking-widest px-1">Insight Prodotti</h3>
            <div className="flex bg-v-surface p-1 rounded-xl border border-v-accent/10 scale-90">
               <button onClick={() => setTrendTab('MINE')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${trendTab === 'MINE' ? 'bg-v-accent text-v-dark shadow-md' : 'text-v-accent/40'}`}>I Tuoi Top</button>
               <button onClick={() => setTrendTab('PLATFORM')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${trendTab === 'PLATFORM' ? 'bg-v-accent text-v-dark shadow-md' : 'text-v-accent/40'}`}>Trend VIVaI</button>
            </div>
          </div>
          <div className="bg-v-surface rounded-3xl border border-v-accent/15 overflow-hidden shadow-xl">
             <table className="w-full text-left">
                <thead className="bg-v-accent/5 border-b border-v-accent/10">
                   <tr className="text-[9px] font-black text-v-accent/40 uppercase tracking-widest">
                      <th className="px-6 py-4">Prodotto</th>
                      <th className="px-6 py-4">Performance</th>
                      <th className="px-6 py-4">Stock</th>
                      <th className="px-6 py-4 text-right">Suggerimento</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-v-accent/5">
                   {(trendTab === 'MINE' ? MOCK_TRENDS_MINE : MOCK_TRENDS_PLATFORM).map(item => (
                     <tr key={item.id} className="hover:bg-v-accent/5 transition-all group">
                        <td className="px-6 py-4">
                           <p className="text-xs font-black text-v-light leading-tight">{item.name}</p>
                        </td>
                        <td className="px-6 py-4">
                           <span className="text-[10px] font-black text-v-accent">{item.metric}</span>
                        </td>
                        <td className="px-6 py-4">
                           <span className={`text-[10px] font-black ${item.stock <= 5 ? 'text-v-primary' : 'text-v-accent/40'}`}>{item.stock} pz</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                           <span className="text-[9px] font-bold text-v-accent/60 italic">{item.tip}</span>
                        </td>
                     </tr>
                   ))}
                </tbody>
             </table>
          </div>
        </section>

        <section className="lg:col-span-4 space-y-4">
           <h3 className="text-[10px] font-black text-v-accent/40 uppercase tracking-widest px-1">Salute del Catalogo</h3>
           <div className="bg-v-surface p-6 rounded-3xl border border-v-accent/15 shadow-xl space-y-6">
              {[
                { label: 'Foto Reali', val: MOCK_HEALTH.realPhotos },
                { label: 'Attributi', val: MOCK_HEALTH.attributes },
                { label: 'Descrizioni', val: MOCK_HEALTH.descriptions },
                { label: 'Varianti', val: MOCK_HEALTH.variants }
              ].map((h, i) => (
                <div key={i} className="space-y-1.5">
                   <div className="flex justify-between text-[10px] font-black uppercase">
                      <span className="text-v-accent/60">{h.label}</span>
                      <span className={h.val > 80 ? 'text-green-400' : 'text-v-accent'}>{h.val}%</span>
                   </div>
                   <div className="h-1.5 w-full bg-v-dark/50 rounded-full overflow-hidden">
                      <div className={`h-full ${h.val > 80 ? 'bg-green-400' : 'bg-v-accent'}`} style={{ width: `${h.val}%` }}></div>
                   </div>
                </div>
              ))}
              <button onClick={() => setActiveTab('CATALOG')} className="w-full py-4 mt-4 border border-v-accent/20 text-v-accent rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-v-accent/5 transition-all">Migliora Schede</button>
           </div>
        </section>
      </div>
    </div>
  );

  const renderCatalog = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-v-light tracking-tighter uppercase">Gestione Inventario</h2>
          <p className="text-v-accent/60 text-sm font-medium">Gestisci piante, varianti e prodotti del tuo vivaio.</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <div className="bg-v-surface p-1 rounded-xl border border-v-accent/10 flex">
            {['ALL', 'PLANT', 'PRODUCT'].map(t => (
              <button 
                key={t}
                onClick={() => setFilterType(t as any)}
                className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${filterType === t ? 'bg-v-accent text-v-dark' : 'text-v-accent/40'}`}
              >
                {t === 'ALL' ? 'Tutti' : t === 'PLANT' ? 'Piante' : 'Prodotti'}
              </button>
            ))}
          </div>
                    <button
                      onClick={() => {
                        setEditingListing({
                          id: "", // vuoto => create
                          nursery_id: String(user.id_vivaio ?? "1"), // o quello che usi
                          type: "PLANT",
                          title: "",
                          category: "",
                          brand: "",
                          status: "DRAFT",
                          mainImage: "",
                          sellerImages: [],
                          shortDescription: "",
                          longDescription: "",
                          qualityScore: 0,
                          attributes: {},
                          plantSpeciesId: null,
                          plantSpecies: null,
                          imageMode: 'CUSTOM',
                          speciesImageUrl: null,
                          effectiveMainImage: null,
                          variants: [
                            { id: "new-1", sku: "", label: "", price: 0, qty: 0, stock: 0, low_stock_threshold: 0 }
                          ],
                } as any);
              }}
              className="bg-v-accent text-v-dark px-6 py-2.5 rounded-xl text-xs font-black uppercase shadow-xl hover:scale-105 active:scale-95 transition-all"
            >
              Nuovo Listing
            </button>
        </div>
      </header>

      <div className="bg-v-surface rounded-3xl border border-v-accent/15 overflow-hidden shadow-2xl">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-v-accent/5 text-v-accent/50 uppercase text-[9px] font-black tracking-widest border-b border-v-accent/10">
              <th className="px-6 py-5 w-10"></th>
              <th className="px-6 py-5">Prodotto</th>
              <th className="px-6 py-5">Status</th>
              <th className="px-6 py-5">Varianti</th>
              <th className="px-6 py-5 text-right">Quantità</th>
              <th className="px-6 py-5 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-v-accent/5">
            {filteredListings.map(l => (
              <React.Fragment key={l.id}>
                <tr className={`hover:bg-v-accent/5 transition-all group ${expandedRows.has(l.id) ? 'bg-v-accent/5' : ''}`}>
                  <td className="px-6 py-5">
                    <button onClick={() => toggleRow(l.id)} className={`text-v-accent/40 hover:text-v-accent transition-transform ${expandedRows.has(l.id) ? 'rotate-90 text-v-accent' : ''}`}>
                      <i className="fa-solid fa-chevron-right text-xs"></i>
                    </button>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center space-x-4">
                      <img src={getListingPreviewImage(l)} className="w-12 h-12 rounded-xl object-cover border border-v-accent/10" />
                      <div>
                        <p className="font-black text-v-light leading-tight">{l.title}</p>
                        <p className="text-[9px] text-v-accent/40 font-bold uppercase mt-1 tracking-widest">{l.category}</p>
                        {(l as any).plantSpecies && (
                          <p className="text-[9px] text-v-accent/60 italic mt-1">
                            {(l as any).plantSpecies.commonName || (l as any).plantSpecies.commercialName || (l as any).plantSpecies.scientificName}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <CatalogStatusControl listing={l} />
                  </td>
                  <td className="px-6 py-5">
                    <span className="bg-v-dark/50 px-3 py-1 rounded-lg text-[10px] font-black text-v-accent border border-v-accent/10">
                      {l.variants.length} {l.variants.length === 1 ? 'Var' : 'Varianti'}
                    </span>
                  </td>
                  
                  <td className="px-6 py-5 text-right">
                    <span className="text-xs font-black text-v-light">
                      {l.stockTotal ?? l.variants.reduce((s, v) => s + v.qty, 0)} pz
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <button onClick={() => setEditingListing(l)} className="w-9 h-9 rounded-xl bg-v-dark/40 text-v-accent/40 hover:text-v-accent border border-v-accent/5 hover:border-v-accent/20 transition-all">
                      <i className="fa-solid fa-pen-to-square text-xs"></i>
                    </button>
                  </td>
                </tr>
                {expandedRows.has(l.id) && (
                  <tr className="bg-v-dark/20">
                    <td colSpan={6} className="px-0">
                      <div className="px-20 py-4 space-y-2">
                        {l.variants.map(v => (
                          <div key={v.id} className="flex items-center justify-between p-3 rounded-xl bg-v-surface/40 border border-v-accent/5 hover:border-v-accent/10">
                            <div className="flex items-center space-x-6">
                              
                              <span className="text-xs font-bold text-v-light">{v.label}</span>
                            </div>
                            <div className="flex items-center space-x-8">
                               <div className="flex flex-col items-end min-w-[80px]">
                                  <span className="text-[8px] font-black uppercase text-v-accent/30 tracking-widest">Prezzo</span>
                                  {inlineEditingPrice?.variantId === v.id ? (
                                    <div className="flex items-center">
                                      <span className="text-xs font-black text-v-accent mr-1 italic">€</span>
                                      <input 
                                        autoFocus
                                        type="number"
                                        step="0.01"
                                        value={inlineEditingPrice.value}
                                        onChange={(e) => setInlineEditingPrice({ variantId: v.id, value: e.target.value })}
                                        onBlur={() => handleUpdatePrice(l.id, v.id, parseFloat(inlineEditingPrice.value) || 0)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleUpdatePrice(l.id, v.id, parseFloat(inlineEditingPrice.value) || 0)}
                                        className="w-16 bg-v-dark/40 rounded px-1 font-black text-v-accent italic outline-none text-xs border border-v-accent/20"
                                      />
                                    </div>
                                  ) : (
                                    <span 
                                      onClick={() => setInlineEditingPrice({ variantId: v.id, value: v.price.toString() })}
                                      className="text-xs font-black text-v-accent italic cursor-pointer hover:bg-v-accent/5 px-1 rounded transition-all"
                                    >
                                      €{v.price.toFixed(2)}
                                    </span>
                                  )}
                               </div>
                               <div className="flex items-center space-x-3 bg-v-dark/30 p-1.5 rounded-lg border border-v-accent/5">
                                  <button onClick={() => handleUpdateStock(l.id, v.id, v.qty - 1)} className="w-6 h-6 rounded bg-v-accent/10 text-v-accent hover:bg-v-accent hover:text-v-dark transition-all text-xs font-black">-</button>
                                  {inlineEditingStock?.variantId === v.id ? (
                                    <input 
                                      autoFocus
                                      type="number"
                                      value={inlineEditingStock.value}
                                      onChange={(e) => setInlineEditingStock({ variantId: v.id, value: e.target.value })}
                                      onBlur={() => handleUpdateStock(l.id, v.id, parseInt(inlineEditingStock.value) || 0)}
                                      onKeyDown={(e) => e.key === 'Enter' && handleUpdateStock(l.id, v.id, parseInt(inlineEditingStock.value) || 0)}
                                      className="w-10 bg-transparent text-center font-black text-v-light outline-none text-xs"
                                    />
                                  ) : (
                                    <span 
                                      onClick={() => setInlineEditingStock({ variantId: v.id, value: v.qty.toString() })}
                                      className={`w-10 text-center font-black text-xs cursor-pointer ${(Number(v.stock ?? v.qty ?? 0) <= Number(v.low_stock_threshold ?? 0)) ? 'text-v-primary' : 'text-v-light'}`}
                                    >
                                      {Number(v.stock ?? v.qty ?? 0)}
                                    </span>
                                  )}
                                  <button onClick={() => handleUpdateStock(l.id, v.id, v.qty + 1)} className="w-6 h-6 rounded bg-v-accent/10 text-v-accent hover:bg-v-accent hover:text-v-dark transition-all text-xs font-black">+</button>
                               </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderOrders = () => (
  <div className="space-y-8 animate-in fade-in duration-500 pb-20">
    <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
      <div>
        <h2 className="text-3xl font-black text-v-light tracking-tighter uppercase">Ordini</h2>
        <p className="text-v-accent/60 text-sm font-medium">
          Gestisci gli ordini ricevuti e aggiorna lo stato del ritiro.
        </p>
      </div>

      <div className="bg-v-surface p-1 rounded-xl border border-v-accent/10 flex">
        {[
          { id: 'ALL', label: 'Tutti' },
          { id: 'PREPARE', label: 'Da preparare' },
          { id: 'PICKUP', label: 'Pronto ritiro' },
          { id: 'DONE', label: 'Completati' }
        ].map(seg => (
          <button
            key={seg.id}
            onClick={() => setOrderSegment(seg.id as any)}
            className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${
              orderSegment === seg.id ? 'bg-v-accent text-v-dark shadow-lg' : 'text-v-accent/40 hover:text-v-accent/60'
            }`}
          >
            {seg.label}
          </button>
        ))}
      </div>
    </header>

    {ordersLoading && (
      <div className="bg-v-surface rounded-3xl border border-v-accent/15 p-8 text-sm text-v-accent/60">
        Caricamento ordini...
      </div>
    )}

    {!ordersLoading && ordersError && (
      <div className="bg-red-500/10 border border-red-500/20 text-red-300 px-4 py-3 rounded-2xl text-sm">
        {ordersError}
      </div>
    )}

    {!ordersLoading && !ordersError && orders.length === 0 && (
      <div className="bg-v-surface rounded-3xl border border-v-accent/15 p-10 text-center">
        <i className="fa-solid fa-receipt text-3xl text-v-accent mb-3"></i>
        <p className="text-sm font-black text-v-light uppercase tracking-widest">
          Nessun ordine in questa sezione
        </p>
      </div>
    )}

    {!ordersLoading && orders.length > 0 && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {orders.map(order => (
          <div key={order.id} className="bg-v-card p-5 rounded-dex-lg border border-v-accent/10 flex flex-col justify-between group">
            <div className="flex justify-between items-start mb-4 gap-4">
              <div className="space-y-1 min-w-0">
                <span className="text-[10px] font-black text-v-accent uppercase">{order.public_code}</span>
                <h3 className="text-base font-black text-v-light leading-tight truncate">
                  {order.customer_name || "Cliente"}
                </h3>
                <p className="text-[10px] text-v-accent/50 font-bold uppercase">
                  {order.customer_phone}
                </p>
                <p className="text-[10px] text-v-accent/40">
                  {order.items_count} articoli • {orderDateLabel(order.created_at)}
                </p>
              </div>

              <div className="text-right space-y-2">
                <StatusPill status={order.status} />
                <p className="text-sm font-black text-v-light">
                  €{Number(order.total_amount).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => openNurseryOrder(order.id)}
                className="bg-v-accent text-v-dark px-5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
              >
                Gestisci
              </button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);;

const renderInvoiceItemsTable = (inv: InvoiceRecord) => {
  const items = inv.items ?? [];

  if (!items.length) {
    return (
      <div className="px-6 py-4 text-sm text-v-accent/50 italic">
        Nessuna riga articolo estratta
      </div>
    );
  }

  return (
    <div className="px-6 py-4">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
          <tr className="text-[10px] uppercase text-v-accent/40 border-b border-v-accent/10">
            <th className="py-3 pr-4">#</th>
            <th className="py-3 pr-4">Descrizione</th>
            <th className="py-3 pr-4">SKU</th>
            <th className="py-3 pr-4 text-right">Qta</th>
            <th className="py-3 pr-4">UM</th>
            <th className="py-3 pr-4 text-right">Prezzo</th>
            <th className="py-3 pr-4 text-right">IVA %</th>
            <th className="py-3 pr-4 text-right">Totale</th>
            <th className="py-3 text-right">Azione</th>
          </tr>
        </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id ?? `${inv.id}-${idx}`} className="border-b border-v-accent/5">
                <td className="py-3 pr-4 text-v-light font-black">
                  {item.line_no ?? idx + 1}
                </td>
                <td className="py-3 pr-4 text-v-light">
                  {item.description || "—"}
                </td>
                <td className="py-3 pr-4 text-v-accent/60">
                  {item.sku || "—"}
                </td>
                <td className="py-3 pr-4 text-right text-v-light">
                  {item.quantity ?? "—"}
                </td>
                <td className="py-3 pr-4 text-v-accent/60">
                  {item.unit || "—"}
                </td>
                <td className="py-3 pr-4 text-right text-v-light">
                  {item.unit_price != null ? `€${Number(item.unit_price).toFixed(2)}` : "—"}
                </td>
                <td className="py-3 pr-4 text-right text-v-light">
                  {item.vat_rate != null ? `${Number(item.vat_rate).toFixed(2)}%` : "—"}
                </td>
                <td className="py-3 pr-4 text-right font-black text-v-light">
                  {item.line_total != null ? `€${Number(item.line_total).toFixed(2)}` : "—"}
                </td>
                <td className="py-3 text-right">
                  <button
                    onClick={() => handleProposeInvoiceItemToCatalog(item, inv)}
                    className="px-3 py-2 rounded-xl bg-v-accent text-v-dark text-[10px] font-black uppercase hover:scale-105 active:scale-95 transition-all"
                  >
                    Proponi
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const renderInvoices = () => (
  <div className="space-y-8 animate-in fade-in duration-500 pb-20">
    <header className="flex justify-between items-end">
      <h2 className="text-3xl font-black text-v-light uppercase">Fatture</h2>
    </header>

    {invoicesError && (
      <div className="bg-red-500/10 border border-red-500/20 text-red-300 px-4 py-3 rounded-2xl text-sm">
        {invoicesError}
      </div>
    )}

    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="bg-v-surface p-1 rounded-xl border border-v-accent/10 flex w-fit">
        <button
          onClick={() => setInvoiceSegment("VENDITA")}
          className={`px-4 py-2 text-[10px] font-black uppercase ${
            invoiceSegment === "VENDITA"
              ? "bg-v-accent text-v-dark"
              : "text-v-accent/40"
          }`}
        >
          Vendita
        </button>

        <button
          onClick={() => setInvoiceSegment("ACQUISTO")}
          className={`px-4 py-2 text-[10px] font-black uppercase ${
            invoiceSegment === "ACQUISTO"
              ? "bg-v-accent text-v-dark"
              : "text-v-accent/40"
          }`}
        >
          Acquisto
        </button>
      </div>

      <label className="bg-v-accent text-v-dark px-5 py-3 rounded-xl text-[10px] font-black uppercase shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer">
        {invoiceUploading ? "Caricamento..." : "Carica fattura"}
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf,application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={invoiceUploading}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            await handleInvoiceFileUpload(file);
            e.currentTarget.value = "";
          }}
        />
      </label>
    </div>

    <div className="bg-v-surface rounded-3xl border border-v-accent/15 overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-[10px] uppercase text-v-accent/40">
            <th className="px-6 py-4 w-10"></th>
            <th className="px-6 py-4">Numero</th>
            <th className="px-6 py-4">
              {invoiceSegment === "ACQUISTO" ? "Fornitore" : "Cliente"}
            </th>
            <th className="px-6 py-4">Data</th>
            <th className="px-6 py-4 text-right">Totale</th>
          </tr>
        </thead>

        <tbody>
          {invoicesLoading ? (
            <tr>
              <td colSpan={5} className="px-6 py-8 text-center text-sm text-v-accent/50">
                Caricamento fatture...
              </td>
            </tr>
          ) : invoices.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-6 py-8 text-center text-sm text-v-accent/50">
                Nessuna fattura trovata
              </td>
            </tr>
          ) : (
            invoices.map(inv => (
              <React.Fragment key={inv.id}>
                <tr
                  className={`border-t border-v-accent/5 hover:bg-v-accent/5 transition-all ${
                    expandedInvoiceIds.has(inv.id) ? "bg-v-accent/5" : ""
                  }`}
                >
                  <td className="px-6 py-4">
                    <button
                      onClick={() => toggleInvoiceRow(inv.id)}
                      className={`text-v-accent/40 hover:text-v-accent transition-transform ${
                        expandedInvoiceIds.has(inv.id) ? "rotate-90 text-v-accent" : ""
                      }`}
                    >
                      <i className="fa-solid fa-chevron-right text-xs"></i>
                    </button>
                  </td>

                  <td className="px-6 py-4 font-black text-v-light">
                    {inv.invoice_number || `#${inv.id}`}
                  </td>

                  <td className="px-6 py-4">
                    {invoiceSegment === "ACQUISTO"
                      ? (inv.supplier_name || "—")
                      : (inv.customer_name || "—")}
                  </td>

                  <td className="px-6 py-4">
                    {inv.invoice_date || "—"}
                  </td>

                  <td className="px-6 py-4 text-right font-black">
                    {inv.total_amount != null
                      ? `€${Number(inv.total_amount).toFixed(2)}`
                      : "—"}
                  </td>
                </tr>

                {expandedInvoiceIds.has(inv.id) && (
                  <tr className="bg-v-dark/20">
                    <td colSpan={5} className="px-0">
                      {renderInvoiceItemsTable(inv)}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))
          )}
        </tbody>
      </table>
    </div>

    <div className="flex justify-end pt-4">
      <button
        onClick={() => alert("Export CSV mock")}
        className="bg-v-accent text-v-dark px-5 py-3 rounded-xl text-[10px] font-black uppercase shadow-xl hover:scale-105 active:scale-95 transition-all"
      >
        Esporta CSV
      </button>
    </div>
  </div>
);


  return (
    <div className="flex-1 flex flex-col md:flex-row h-screen overflow-hidden bg-v-dark">
      <aside className="w-full md:w-64 bg-v-surface border-r border-v-accent/10 p-6 flex flex-col shadow-2xl z-[100]">
        <div className="flex items-center space-x-3 mb-12">
          <div className="w-10 h-10 bg-v-accent rounded-xl flex items-center justify-center text-v-dark font-black text-xl">V</div>
          <span className="font-black text-2xl tracking-tighter text-v-light">VIVaI</span>
        </div>
        <nav className="flex-1 space-y-3">
          {[
            { id: 'DASHBOARD', icon: 'fa-chart-line', label: 'Dashboard' },
            { id: 'CATALOG', icon: 'fa-boxes-stacked', label: 'Catalogo' },
            { id: 'ORDERS', icon: 'fa-truck-ramp-box', label: 'Ordini' },
            { id: 'INVOICES', icon: 'fa-file-invoice', label: 'Fatture' }
          ].map(item => (
            <button 
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`w-full flex items-center space-x-4 p-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all ${activeTab === item.id ? 'bg-v-accent text-v-dark shadow-xl' : 'text-v-accent/40 hover:text-v-accent hover:bg-v-accent/5'}`}
            >
              <i className={`fa-solid ${item.icon} w-5 text-center`}></i>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        {activeTab === 'DASHBOARD' && renderDashboard()}
        {activeTab === 'CATALOG' && renderCatalog()}
        {activeTab === 'ORDERS' && renderOrders()}
        {activeTab === 'INVOICES' && renderInvoices()}
      </main>

      {(selectedOrder || selectedOrderLoading) && (
  <div className="fixed inset-0 z-[600] flex justify-end">
    <div
      className="absolute inset-0 bg-v-dark/80 backdrop-blur-sm"
      onClick={() => {
        if (!orderUpdatingStatus) setSelectedOrder(null);
      }}
    ></div>

    <div className="relative w-full max-w-md bg-v-surface h-full p-8 border-l border-v-accent/10 animate-in slide-in-from-right overflow-y-auto">
      <div className="flex justify-between items-center mb-10">
        <h3 className="text-xl font-black text-v-light uppercase">
          {selectedOrder ? selectedOrder.public_code : "Ordine"}
        </h3>
        <button onClick={() => setSelectedOrder(null)}>
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>

      {selectedOrderLoading && (
        <p className="text-sm text-v-accent/60">Caricamento dettaglio...</p>
      )}

      {selectedOrder && (
        <div className="space-y-6">
          <div className="p-4 bg-v-dark/40 rounded-2xl border border-v-accent/10">
            <p className="text-[10px] font-black text-v-accent uppercase">Cliente</p>
            <p className="text-v-light font-bold">{selectedOrder.customer_name || "Cliente"}</p>
            <p className="text-[10px] text-v-accent/60 mt-1">{selectedOrder.customer_phone}</p>
            {selectedOrder.customer_email && (
              <p className="text-[10px] text-v-accent/40">{selectedOrder.customer_email}</p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <StatusPill status={selectedOrder.status} />
            <span className="text-[10px] font-bold text-v-accent/50 uppercase">
              {orderDateLabel(selectedOrder.created_at)}
            </span>
          </div>

          <div className="space-y-4">
            <p className="text-[10px] font-black text-v-accent uppercase">Articoli</p>
            {selectedOrder.items.map((it) => (
              <div key={it.id} className="flex justify-between gap-4 text-xs border-b border-v-accent/5 pb-3">
                <div className="min-w-0">
                  <p className="text-v-light font-bold truncate">{it.product_name_snapshot}</p>
                  <p className="text-v-accent/50">{it.qty} × €{Number(it.unit_price).toFixed(2)}</p>
                </div>
                <span className="font-black text-v-light">€{Number(it.line_total).toFixed(2)}</span>
              </div>
            ))}
          </div>

          {selectedOrder.notes && (
            <div className="p-4 bg-v-dark/30 rounded-2xl border border-v-accent/10">
              <p className="text-[10px] font-black text-v-accent uppercase mb-2">Note</p>
              <p className="text-sm text-v-light">{selectedOrder.notes}</p>
            </div>
          )}

          <div className="flex items-center justify-between p-4 bg-v-dark/40 rounded-2xl border border-v-accent/10">
            <span className="text-[10px] font-black text-v-accent uppercase">Totale</span>
            <span className="text-lg font-black text-v-light">€{Number(selectedOrder.total_amount).toFixed(2)}</span>
          </div>

          <div className="space-y-3 pt-4">
            <button
              onClick={() => handleNurseryOrderStatus("NEW")}
              disabled={orderUpdatingStatus}
              className="w-full py-3 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 text-yellow-400 text-[10px] font-black uppercase"
            >
              Segna come da preparare
            </button>

            <button
              onClick={() => handleNurseryOrderStatus("READY_FOR_PICKUP")}
              disabled={orderUpdatingStatus}
              className="w-full py-3 rounded-2xl border border-v-accent/20 bg-v-accent/10 text-v-accent text-[10px] font-black uppercase"
            >
              Segna come pronto per il ritiro
            </button>

            <button
              onClick={() => handleNurseryOrderStatus("COMPLETED")}
              disabled={orderUpdatingStatus}
              className="w-full py-3 rounded-2xl border border-green-500/20 bg-green-500/10 text-green-400 text-[10px] font-black uppercase"
            >
              Segna come completato
            </button>
          </div>
        </div>
      )}
    </div>
  </div>
)}

      {editingListing && (
        <div className="fixed inset-0 z-[500] pointer-events-none">
          
          <div className="absolute inset-0 bg-v-dark/60 backdrop-blur-sm pointer-events-auto" onClick={() => setEditingListing(null)}></div>
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-xl bg-v-surface shadow-2xl pointer-events-auto border-l border-v-accent/20 flex flex-col animate-in slide-in-from-right duration-500">
            <header className="p-8 border-b border-v-accent/10 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-v-light tracking-tighter uppercase">
                  {editingListing.id ? "Modifica Listing" : "Nuovo Listing Proposto"}
                </h3>
                <p className="text-[10px] font-black text-v-accent/40 uppercase tracking-widest">{editingListing.id}</p>
              </div>
              <button onClick={() => setEditingListing(null)} className="w-10 h-10 rounded-full bg-v-dark/50 flex items-center justify-center text-v-light hover:text-v-accent"><i className="fa-solid fa-xmark"></i></button>
            </header>
            <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
              <div className="space-y-3">
                <label className="text-[9px] font-black text-v-accent/40 uppercase tracking-widest">Tipo</label>
                <select
                  value={editingListing.type}
                  onChange={(e) => setEditingListing(prev => prev ? ({ ...prev, type: e.target.value as any }) : prev)}
                  className="w-full bg-v-dark/30 rounded-xl px-4 py-3 text-xs border border-v-accent/10 text-v-light outline-none"
                >
                  <option value="PLANT">Pianta</option>
                  <option value="PRODUCT">Prodotto</option>
                </select>

                <label className="text-[9px] font-black text-v-accent/40 uppercase tracking-widest">Titolo</label>
                <input
                  value={editingListing.title}
                  onChange={(e) => setEditingListing(prev => prev ? ({ ...prev, title: e.target.value }) : prev)}
                  className="w-full bg-v-dark/30 rounded-xl px-4 py-3 text-xs border border-v-accent/10 text-v-light outline-none"
                  placeholder="Es. Monstera Deliciosa Premium"
                />

                <label className="text-[9px] font-black text-v-accent/40 uppercase tracking-widest">Categoria</label>
                <input
                  value={editingListing.category}
                  onChange={(e) => setEditingListing(prev => prev ? ({ ...prev, category: e.target.value }) : prev)}
                  className="w-full bg-v-dark/30 rounded-xl px-4 py-3 text-xs border border-v-accent/10 text-v-light outline-none"
                  placeholder="Es. Piante da interno"
                />

                <div className="space-y-3">
                  <label className="text-[9px] font-black text-v-accent/40 uppercase tracking-widest">Specie collegata (opzionale)</label>
                  <input
                    value={speciesQuery}
                    onChange={(e) => {
                      setSpeciesQuery(e.target.value);
                      if (editingListing?.plantSpecies && e.target.value !== (editingListing.plantSpecies.commonName || editingListing.plantSpecies.commercialName || editingListing.plantSpecies.scientificName)) {
                        setEditingListing(prev => prev ? ({ ...prev, plantSpeciesId: null, plantSpecies: null, speciesImageUrl: null, imageMode: prev.mainImage ? 'CUSTOM' : prev.imageMode }) : prev);
                      }
                    }}
                    className="w-full bg-v-dark/30 rounded-xl px-4 py-3 text-xs border border-v-accent/10 text-v-light outline-none"
                    placeholder="Cerca specie: ortensia, plumbago, salvia..."
                  />

                  {speciesLoading && <p className="text-[10px] text-v-accent/50">Ricerca specie...</p>}
                  {speciesError && <p className="text-[10px] text-red-300">{speciesError}</p>}

                  {editingListing.plantSpecies && (
                    <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-v-dark/20 border border-v-accent/10">
                      <div className="flex items-center gap-3 min-w-0">
                        <img src={editingListing.speciesImageUrl || NO_IMAGE} className="w-12 h-12 rounded-xl object-cover border border-v-accent/10" />
                        <div className="min-w-0">
                          <p className="text-xs font-black text-v-light truncate">
                            {editingListing.plantSpecies.commonName || editingListing.plantSpecies.commercialName || 'Specie collegata'}
                          </p>
                          <p className="text-[10px] text-v-accent/50 italic truncate">{editingListing.plantSpecies.scientificName}</p>
                        </div>
                      </div>
                      <button
                        onClick={clearPlantSpecies}
                        className="px-3 py-2 rounded-xl bg-v-dark/40 border border-v-accent/10 text-[9px] font-black uppercase text-v-accent"
                      >
                        Rimuovi
                      </button>
                    </div>
                  )}

                  {!editingListing.plantSpecies && speciesResults.length > 0 && (
                    <div className="rounded-2xl border border-v-accent/10 overflow-hidden bg-v-dark/20">
                      {speciesResults.map((sp) => (
                        <button
                          key={sp.id}
                          onClick={() => choosePlantSpecies(sp)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-v-accent/5 border-b last:border-b-0 border-v-accent/5"
                        >
                          <img src={sp.image || NO_IMAGE} className="w-10 h-10 rounded-xl object-cover border border-v-accent/10" />
                          <div className="min-w-0">
                            <p className="text-xs font-black text-v-light truncate">{sp.commonName || sp.commercialName || 'Specie'}</p>
                            <p className="text-[10px] text-v-accent/50 italic truncate">{sp.scientificName}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <label className="text-[9px] font-black text-v-accent/40 uppercase tracking-widest">
                  Immagine principale
                </label>

                {editingListing.plantSpecies && editingListing.speciesImageUrl && (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingListing(prev => prev ? ({ ...prev, imageMode: 'SPECIES' }) : prev)}
                      className={`p-3 rounded-2xl border text-left ${editingListing.imageMode === 'SPECIES' ? 'border-v-accent bg-v-accent/10 text-v-accent' : 'border-v-accent/10 bg-v-dark/20 text-v-accent/60'}`}
                    >
                      <p className="text-[10px] font-black uppercase tracking-widest">Immagine specie</p>
                      <p className="text-[10px] mt-1">Usa la cover di repertorio collegata alla pianta</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingListing(prev => prev ? ({ ...prev, imageMode: 'CUSTOM' }) : prev)}
                      className={`p-3 rounded-2xl border text-left ${editingListing.imageMode !== 'SPECIES' ? 'border-v-accent bg-v-accent/10 text-v-accent' : 'border-v-accent/10 bg-v-dark/20 text-v-accent/60'}`}
                    >
                      <p className="text-[10px] font-black uppercase tracking-widest">Immagine vivaio</p>
                      <p className="text-[10px] mt-1">Carica una tua foto e usala come principale</p>
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      try {
                        const fd = new FormData();
                        fd.append("file", file);

                        const res = await fetch("/api/uploads", {
                          method: "POST",
                          credentials: "include",
                          body: fd,
                        });

                        if (!res.ok) {
                          const err = await res.json().catch(() => ({}));
                          console.error("Upload failed", res.status, err);
                          alert(err?.error ?? "Upload fallito");
                          return;
                        }

                        const data = await res.json(); // { url: "/uploads/..." }
                        setEditingListing(prev => prev ? ({ ...prev, mainImage: data.url, imageMode: 'CUSTOM' }) : prev);
                      } catch (err) {
                        console.error(err);
                        alert("Errore rete upload");
                      } finally {
                        // reset input file (così puoi ricaricare lo stesso file)
                        e.currentTarget.value = "";
                      }
                    }}
                    className="block w-full text-xs text-v-accent/60
                              file:mr-3 file:py-2 file:px-3
                              file:rounded-xl file:border-0
                              file:bg-v-dark/40 file:text-v-accent
                              hover:file:bg-v-dark/60"
                  />

                  {editingListing.mainImage && (
                    <button
                      onClick={() => setEditingListing(prev => prev ? ({ ...prev, mainImage: "" }) : prev)}
                      className="px-3 py-2 rounded-xl bg-v-dark/40 border border-v-accent/10 text-[9px] font-black uppercase text-v-accent"
                      title="Rimuovi immagine"
                    >
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  )}
                </div>

                {editingListing.mainImage && (
                  <div className="mt-3 w-24 h-24 rounded-2xl overflow-hidden border border-v-accent/10 bg-v-dark">
                    <img src={getListingPreviewImage(editingListing)} className="w-full h-full object-cover" />
                  </div>
                )}

                <label className="text-[9px] font-black text-v-accent/40 uppercase tracking-widest">Descrizione breve</label>
                <textarea
                  value={editingListing.shortDescription ?? ""}
                  onChange={(e) => setEditingListing(prev => prev ? ({ ...prev, shortDescription: e.target.value }) : prev)}
                  className="w-full bg-v-dark/30 rounded-xl px-4 py-3 text-xs border border-v-accent/10 text-v-light outline-none min-h-[90px]"
                  placeholder="Una frase chiara e vendibile"
                />
              </div>
              <div className="bg-v-accent/5 rounded-2xl p-5 border border-v-accent/10 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-v-accent uppercase tracking-widest mb-1">Stock</p>
                  <p className="text-xs text-v-light font-medium italic opacity-60">Completa la descrizione lunga per migliorare la visibilità (+15 pts).</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-v-accent">{editingListing.qualityScore}</span>
                  <span className="text-[10px] font-bold opacity-30 block">/100</span>
                </div>
              </div>
              <div className="space-y-3">
  <div className="flex items-center justify-between">
    <p className="text-[10px] font-black text-v-accent/40 uppercase tracking-widest">Varianti</p>
    <button
      onClick={() => setEditingListing(prev => {
        if (!prev) return prev;
        const next = [...(prev.variants || [])];
        next.push({ id: `new-${Date.now()}`, sku: "", label: "", price: 0, qty: 0, stock: 0, low_stock_threshold: 0 } as any);
        return { ...prev, variants: next };
      })}
      className="px-3 py-2 rounded-xl bg-v-dark/40 border border-v-accent/10 text-[9px] font-black uppercase text-v-accent"
    >
      + Variante
    </button>
  </div>

  {(editingListing.variants || []).map((v: any, idx: number) => (
    <div key={v.id ?? idx} className="bg-v-dark/20 border border-v-accent/10 rounded-2xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input
          value={v.sku ?? ""}
          onChange={(e) => setEditingListing(prev => {
            if (!prev) return prev;
            const next = prev.variants.map((vv: any, i: number) => i === idx ? ({ ...vv, sku: e.target.value }) : vv);
            return { ...prev, variants: next };
          })}
          className="bg-v-dark/30 rounded-xl px-3 py-2 text-xs border border-v-accent/10 text-v-light outline-none"
          placeholder="SKU (es. MON-12)"
        />
        <input
          value={v.label ?? ""}
          onChange={(e) => setEditingListing(prev => {
            if (!prev) return prev;
            const next = prev.variants.map((vv: any, i: number) => i === idx ? ({ ...vv, label: e.target.value }) : vv);
            return { ...prev, variants: next };
          })}
          className="bg-v-dark/30 rounded-xl px-3 py-2 text-xs border border-v-accent/10 text-v-light outline-none"
          placeholder="Label (es. Vaso 12cm)"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <input
          type="number"
          step="0.01"
          value={v.price ?? 0}
          onChange={(e) => setEditingListing(prev => {
            if (!prev) return prev;
            const next = prev.variants.map((vv: any, i: number) => i === idx ? ({ ...vv, price: Number(e.target.value) }) : vv);
            return { ...prev, variants: next };
          })}
          className="bg-v-dark/30 rounded-xl px-3 py-2 text-xs border border-v-accent/10 text-v-light outline-none"
          placeholder="Prezzo"
        />
        <input
          type="number"
          value={v.qty ?? 0}
          onChange={(e) => setEditingListing(prev => {
            if (!prev) return prev;
            const next = prev.variants.map((vv: any, i: number) =>
              i === idx ? ({ ...vv, qty: Number(e.target.value), stock: Number(e.target.value) }) : vv
            );
            return { ...prev, variants: next };
          })}
          className="bg-v-dark/30 rounded-xl px-3 py-2 text-xs border border-v-accent/10 text-v-light outline-none"
          placeholder="Quantità"
        />
        <input
          type="number"
          value={v.low_stock_threshold ?? 0}
          onChange={(e) => setEditingListing(prev => {
            if (!prev) return prev;
            const next = prev.variants.map((vv: any, i: number) => i === idx ? ({ ...vv, low_stock_threshold: Number(e.target.value) }) : vv);
            return { ...prev, variants: next };
          })}
          className="bg-v-dark/30 rounded-xl px-3 py-2 text-xs border border-v-accent/10 text-v-light outline-none"
          placeholder="Soglia"
        />
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => setEditingListing(prev => {
            if (!prev) return prev;
            const next = prev.variants.filter((_: any, i: number) => i !== idx);
            return { ...prev, variants: next.length ? next : prev.variants }; // evita zero varianti
          })}
          className="text-[9px] font-black uppercase text-v-accent/50 hover:text-v-accent"
        >
          Rimuovi variante
        </button>
      </div>
    </div>
  ))}
</div>
            </div>
            
            <footer className="p-8 border-t border-v-accent/10 bg-v-dark/20 flex space-x-4">
              <button onClick={() => setEditingListing(null)} className="flex-1 py-4 border border-v-accent/20 text-v-accent rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-v-accent/5 transition-all">Annulla</button>
              <button
                onClick={async () => {
                  if (!editingListing) return;

                  const payload = toListingPayload(editingListing);

                  // validazioni minime
                  if (!payload.title || !payload.category) {
                    alert("Titolo e categoria sono obbligatori");
                    return;
                  }
                  if (payload.imageMode === 'SPECIES' && !payload.plantSpeciesId) {
                    alert("Per usare l'immagine di repertorio devi collegare una specie");
                    return;
                  }
       /*           if (!payload.variants.length || !payload.variants[0].sku || !payload.variants[0].label) {
                    alert("Inserisci almeno 1 variante con SKU e Label");
                    return;
                  }
*/
                  try {
                    const isEdit = !!editingListing.id; // se ha id -> update, se vuoto -> create
                  if (isEdit) {
                    await updateNurseryListing(String(editingListing.id), payload);
                  } else {
                    await createNurseryListing(payload);
                  }
                    setEditingListing(null);
                    // ricarica catalogo
                    const data = await getNurseryListings(filterType);
                    setListings(data);
                  } catch (e: any) {
                    console.error(e);
                    alert(e?.message ?? "Errore salvataggio");
                  }
                }}
                className="flex-1 py-4 bg-v-accent text-v-dark rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-v-accent/10"
              >
                Salva
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default NurseryConsole;
