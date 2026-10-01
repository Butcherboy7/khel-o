/** Category -> Activity -> Style -> Attributes (GET /cafes/taxonomy). */
export interface TaxonomyAttribute {
  key: string;
  label: string;
  type: 'enum' | 'multi' | 'int' | 'bool' | 'text';
  level: 'required' | 'recommended' | 'optional';
  options?: string[];
  suggestions?: string[];
  unit?: string;
  filterable?: boolean;
}

export interface TaxonomyStyle {
  key: string; // "pool.american"
  label: string;
  /** One plain sentence for beginners ("Solids and stripes, with larger pockets."). */
  hint?: string;
  aliases: string[];
}

export interface TaxonomyActivity {
  key: string; // "pool"
  label: string;
  category: string;
  rank: number;
  aliases: string[];
  bookable_now: boolean;
  billing_unit: 'hour' | 'session' | 'game';
  styles: TaxonomyStyle[];
  attributes: TaxonomyAttribute[];
}

export interface Taxonomy {
  version: number;
  categories: { key: string; label: string; rank: number }[];
  activities: TaxonomyActivity[];
}

export type TierAttributes = Record<string, string | number | boolean | string[]>;
