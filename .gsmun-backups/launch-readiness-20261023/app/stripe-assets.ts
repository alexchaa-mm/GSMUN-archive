export const STRIPE_ASSET_ROOT = "/assets/stripe-press";

export type StripeTextureReference = {
  name: string;
  local_file: string | null;
};

export type StripeBookAsset = {
  index: number;
  slug: string;
  title: string;
  short_title: string | null;
  material: Record<string, number | string | number[]>;
  palette: {
    color: string;
    backgroundColor: string;
    coverColor?: string;
  };
  textures: Record<string, StripeTextureReference>;
};

export type StripeTextureAsset = {
  name: string;
  runtime_url: string;
  original_url: string;
  local_file: string;
  content_type: string;
  bytes: number;
  sha256: string;
};

export type StripeSourceAsset = {
  url: string;
  local_file: string;
  bytes: number;
  sha256: string;
};

export type StripeFileAsset = {
  local_file: string;
  bytes: number;
  sha256: string;
};

export type StripeAssetManifest = {
  source_page: string;
  counts: {
    books: number;
    textures: number;
    javascript_files: number;
  };
  geometry: StripeFileAsset & {
    source_bundle: string;
  };
  shaders: StripeFileAsset[];
  poor_charlies_almanack_sample: StripeFileAsset & {
    url: string;
  };
  textures: StripeTextureAsset[];
  source_javascript: StripeSourceAsset[];
};

export function stripeAssetUrl(localFile: string) {
  return `${STRIPE_ASSET_ROOT}/${localFile}`;
}
