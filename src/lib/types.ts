export type Product = {
  id: string;
  name: string;
  price: number;
  description: string | null;
  brand?: string | null;
  model?: string | null;
  ram?: string | null;
  storage?: string | null;
  color?: string | null;
  imei?: string | null;
  user_id?: string | null;
  created_at: string;
};

export type ProductSpecs = {
  brand: string;
  model: string;
  ram: string;
  storage: string;
  color: string;
  imei: string;
  image?: string;
  images?: string[];
};

export function getProductSpecs(product: Product): ProductSpecs {
  let specs: Partial<ProductSpecs> = {};
  if (product.description) {
    try {
      if (product.description.trim().startsWith('{')) {
        specs = JSON.parse(product.description);
      }
    } catch {
      // not JSON
    }
  }

  const primaryImage = (product as any).image_url || specs.image || '';
  const images = Array.isArray(specs.images) && specs.images.length > 0
    ? specs.images
    : (primaryImage ? [primaryImage] : []);

  return {
    brand: product.brand || specs.brand || '',
    model: product.model || specs.model || product.name,
    ram: product.ram || specs.ram || '',
    storage: product.storage || specs.storage || '',
    color: product.color || specs.color || '',
    imei: product.imei || specs.imei || '',
    image: primaryImage,
    images: images,
  };
}

export type Customer = {
  id: string;
  name: string;
  phone: string;
  cnic?: string | null;
  alternate_phone?: string | null;
  address: string | null;
  created_at: string;
};

export type InstallmentStatus = 'active' | 'completed';
export type PaymentStatus = 'unpaid' | 'paid' | 'overdue' | 'pending_approval';

export type Installment = {
  id: string;
  customer_id: string;
  product_id: string;
  product_price: number;
  down_payment: number;
  remaining_balance: number;
  number_of_installments: number;
  installment_amount: number;
  qr_code_ref: string;
  status: InstallmentStatus;
  is_locked: boolean;
  created_at: string;
};

export type Payment = {
  id: string;
  installment_id: string;
  installment_number: number;
  amount: number;
  due_date: string;
  status: PaymentStatus;
  paid_at: string | null;
  created_at: string;
};

export type InstallmentWithRelations = Installment & {
  customers: Pick<Customer, 'id' | 'name' | 'phone' | 'cnic' | 'alternate_phone' | 'address'> | null;
  products: Pick<Product, 'id' | 'name' | 'price'> | null;
  payments: Payment[];
};
