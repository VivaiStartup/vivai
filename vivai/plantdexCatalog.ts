
export type LightLevel = 'Bassa' | 'Media' | 'Alta';
export type CareLevel = 'Facile' | 'Media' | 'Esperta';
export type SizeLevel = 'Piccola' | 'Media' | 'Grande';
export type WaterLevel = 'Bassa' | 'Media' | 'Alta';

export interface PlantDexEntry {
  id: string;
  commonName: string;
  scientificName: string;
  image: string;
  description: string;
  light: LightLevel;
  care: CareLevel;
  petSafe: boolean;
  size: SizeLevel;
  watering: WaterLevel;
  tags: string[];
}

export const PLANTDEX_CATALOG: PlantDexEntry[] = [
  {
    id: 'dx1',
    commonName: 'Monstera Deliciosa',
    scientificName: 'Monstera deliciosa',
    image: 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?q=80&w=400&h=600&auto=format&fit=crop',
    description: 'La regina delle piante da interno, famosa per le sue foglie forate.',
    light: 'Media',
    care: 'Facile',
    petSafe: false,
    size: 'Grande',
    watering: 'Media',
    tags: ['PURIFYING', 'LARGE_SPACE']
  },
  {
    id: 'dx2',
    commonName: 'Sansevieria',
    scientificName: 'Dracaena trifasciata',
    image: 'https://images.unsplash.com/photo-1593433551532-794aa830fe72?q=80&w=400&h=600&auto=format&fit=crop',
    description: 'Quasi indistruttibile, perfetta per chi ha poca luce o poco tempo.',
    light: 'Bassa',
    care: 'Facile',
    petSafe: false,
    size: 'Media',
    watering: 'Bassa',
    tags: ['LOW_LIGHT', 'PURIFYING']
  },
  {
    id: 'dx3',
    commonName: 'Calathea Orbifolia',
    scientificName: 'Goeppertia orbifolia',
    image: 'https://images.unsplash.com/photo-1597055181300-e3633a207519?q=80&w=400&h=600&auto=format&fit=crop',
    description: 'Foglie tonde e venature eleganti. Ama l\'umidità.',
    light: 'Media',
    care: 'Esperta',
    petSafe: true,
    size: 'Media',
    watering: 'Alta',
    tags: ['PET_FRIENDLY', 'PURIFYING']
  },
  {
    id: 'dx4',
    commonName: 'Pilea Peperomioides',
    scientificName: 'Pilea peperomioides',
    image: 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?q=80&w=200&h=200&auto=format&fit=crop',
    description: 'La pianta dei soldi cinese. Facile da moltiplicare.',
    light: 'Alta',
    care: 'Facile',
    petSafe: true,
    size: 'Piccola',
    watering: 'Media',
    tags: ['PET_FRIENDLY']
  },
  {
    id: 'dx5',
    commonName: 'Ficus Lyrata',
    scientificName: 'Ficus lyrata',
    image: 'https://images.unsplash.com/photo-1545239351-ef35f43d514b?q=80&w=400&h=600&auto=format&fit=crop',
    description: 'Iconica pianta d\'arredamento con grandi foglie a forma di violino.',
    light: 'Alta',
    care: 'Media',
    petSafe: false,
    size: 'Grande',
    watering: 'Media',
    tags: ['LARGE_SPACE']
  },
  {
    id: 'dx6',
    commonName: 'Areca Palm',
    scientificName: 'Dypsis lutescens',
    image: 'https://images.unsplash.com/photo-1512428813824-f713cbc904e4?q=80&w=400&h=600&auto=format&fit=crop',
    description: 'Porta un tocco tropicale e purifica l\'aria.',
    light: 'Alta',
    care: 'Media',
    petSafe: true,
    size: 'Grande',
    watering: 'Alta',
    tags: ['PET_FRIENDLY', 'PURIFYING', 'LARGE_SPACE']
  },
  {
    id: 'dx7',
    commonName: 'Aspidistra',
    scientificName: 'Aspidistra elatior',
    image: 'https://images.unsplash.com/photo-1599385554133-2a5436f56860?q=80&w=400&h=600&auto=format&fit=crop',
    description: 'Conosciuta come "pianta di piombo" per la sua incredibile resistenza.',
    light: 'Bassa',
    care: 'Facile',
    petSafe: true,
    size: 'Media',
    watering: 'Bassa',
    tags: ['PET_FRIENDLY', 'LOW_LIGHT']
  },
  {
    id: 'dx8',
    commonName: 'Kentia',
    scientificName: 'Howea forsteriana',
    image: 'https://images.unsplash.com/photo-1509423350716-97f9360b4e59?q=80&w=400&h=600&auto=format&fit=crop',
    description: 'Elegante palma che tollera bene gli ambienti poco luminosi.',
    light: 'Media',
    care: 'Facile',
    petSafe: true,
    size: 'Grande',
    watering: 'Media',
    tags: ['PET_FRIENDLY', 'LOW_LIGHT', 'LARGE_SPACE']
  }
];
