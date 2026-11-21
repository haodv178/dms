import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CATEGORY_CATALOG: Record<
  string,
  {
    prefix: string;
    items: string[];
    brands: string[];
    variants: string[];
    units: string[];
    minPrice: number;
    maxPrice: number;
  }
> = {
  'Thực phẩm tươi sống': {
    prefix: 'FRESH',
    items: [
      'Thịt ba rọi heo',
      'Thịt nạc vai heo',
      'Sườn non heo',
      'Thịt bò thăn nội',
      'Thịt bò xay',
      'Ức gà phi lê',
      'Đùi gà góc tư',
      'Cá hồi phi lê',
      'Cá basa cắt khúc',
      'Tôm thẻ tươi',
      'Mực ống làm sạch',
      'Trứng gà tươi',
      'Trứng vịt sạch',
      'Chả lụa truyền thống',
      'Xúc xích tiệt trùng',
    ],
    brands: ['CP', 'MeatDeli', 'Vissan', 'Ba Huân', 'Lotte Choice', 'Hòa Phát', 'San Hà'],
    variants: ['250g', '300g', '500g', '1kg', 'Hộp 10 quả', 'Khay 400g', 'Túi 600g'],
    units: ['Khay', 'Hộp', 'Kg', 'Gói'],
    minPrice: 28000,
    maxPrice: 320000,
  },
  'Rau củ & Trái cây': {
    prefix: 'PRODUCE',
    items: [
      'Rau cải ngọt hữu cơ',
      'Rau muống sạch',
      'Xà lách lô lô xanh',
      'Cà chua bi Đà Lạt',
      'Khoai tây vàng',
      'Cà rốt Đà Lạt',
      'Bông cải xanh',
      'Hành tây tím',
      'Táo Envy New Zealand',
      'Nho xanh không hạt',
      'Cam sành Vĩnh Long',
      'Xoài cát Hòa Lộc',
      'Chuối sứ chín cây',
      'Dưa hấu không hạt',
      'Bơ sáp Đắk Lắk',
    ],
    brands: ['Đà Lạt GAP', 'VinEco', 'Orlar', 'Lotte Fresh', 'Nông Sản Việt', 'GlobalGAP'],
    variants: ['250g', '300g', '500g', '1kg', 'Hộp 500g', 'Túi 1kg'],
    units: ['Gói', 'Kg', 'Hộp', 'Túi'],
    minPrice: 15000,
    maxPrice: 220000,
  },
  'Thực phẩm khô': {
    prefix: 'DRY',
    items: [
      'Gạo thơm ST25',
      'Gạo Jasmine dẻo',
      'Mì ăn liền tôm chua cay',
      'Mì Ý Spaghetti số 5',
      'Phở khô truyền thống',
      'Bún gạo lứt',
      'Dầu ăn thực vật',
      'Dầu đậu nành nguyên chất',
      'Nước mắm nhĩ cao cấp',
      'Nước tương đậu nành',
      'Đường tinh luyện',
      'Muối biển i-ốt',
      'Hạt nêm thịt thăn',
      'Tương ớt cay dịu',
      'Bột mì đa dụng',
    ],
    brands: ['Ông Cua', 'Neptune', 'Simply', 'Chinsu', 'Nam Ngư', 'Hảo Hảo', 'Barilla', 'Meizan', 'Knorr'],
    variants: ['200g', '500g', '1kg', '2kg', '5kg', 'Chai 500ml', 'Chai 1L', 'Chai 2L', 'Thùng 30 gói'],
    units: ['Gói', 'Túi', 'Chai', 'Thùng', 'Hộp'],
    minPrice: 12000,
    maxPrice: 280000,
  },
  'Sữa & Đồ uống': {
    prefix: 'DRINK',
    items: [
      'Sữa tươi tiệt trùng ít đường',
      'Sữa tươi không đường',
      'Sữa chua uống lên men',
      'Sữa hạt óc chó hạnh nhân',
      'Sữa đặc có đường',
      'Nước ngọt có gas',
      'Trà xanh không độ',
      'Trà ô long nguyên lá',
      'Nước ép cam nguyên chất',
      'Nước khoáng thiên nhiên',
      'Cà phê rang xay nguyên chất',
      'Cà phê hòa tan 3in1',
      'Bia lon cao cấp',
      'Nước tăng lực',
      'Trà đào cam sả',
    ],
    brands: ['Vinamilk', 'TH True Milk', 'Yakult', 'Coca-Cola', 'Pepsi', 'Trung Nguyên', 'Heineken', 'LaVie', 'C2'],
    variants: ['180ml', '320ml', '500ml', '1L', 'Lốc 4 hộp', 'Lốc 6 lon', 'Thùng 24 lon', 'Gói 500g'],
    units: ['Hộp', 'Chai', 'Lốc', 'Thùng', 'Lon'],
    minPrice: 10000,
    maxPrice: 460000,
  },
  'Hóa mỹ phẩm': {
    prefix: 'HOME',
    items: [
      'Nước giặt cửa trước',
      'Nước giặt cửa trên',
      'Nước xả vải hương nước hoa',
      'Nước rửa chén hương chanh',
      'Nước lau sàn hương hoa ly',
      'Nước tẩy rửa nhà tắm',
      'Dầu gội dưỡng tóc suôn mượt',
      'Sữa tắm dưỡng ẩm',
      'Kem đánh răng bạc hà',
      'Nước súc miệng kháng khuẩn',
      'Xà phòng cục kháng khuẩn',
      'Giấy vệ sinh 3 lớp',
      'Khăn giấy ăn rút tiện lợi',
      'Nước rửa tay diệt khuẩn',
      'Sữa rửa mặt dịu nhẹ',
    ],
    brands: ['Ariel', 'Omo', 'Downy', 'Comfort', 'Sunlight', 'Lifebuoy', 'Dove', 'P/S', 'Colgate', 'Pulppy'],
    variants: ['250ml', '500ml', '750ml', '1.8L', '2.5L', '3.2kg', 'Lốc 10 cuộn', 'Gói 180 tờ'],
    units: ['Chai', 'Túi', 'Hộp', 'Lốc', 'Gói'],
    minPrice: 18000,
    maxPrice: 295000,
  },
  'Khác': {
    prefix: 'OTHER',
    items: [
      'Hộp đựng thực phẩm chịu nhiệt',
      'Màng bọc thực phẩm an toàn',
      'Túi rác tự hủy sinh học',
      'Găng tay cao su gia dụng',
      'Miếng rửa chén bọt biển',
      'Pin kiềm AA chính hãng',
      'Khăn lau bếp đa năng',
      'Bình giữ nhiệt inox 304',
      'Ly thủy tinh cường lực',
      'Móc treo quần áo nhựa',
    ],
    brands: ['Lock&Lock', 'Inochi', 'Ringo', 'Energizer', 'Lotte Home', '3M Scotch-Brite'],
    variants: ['Bộ 3 cái', 'Bộ 5 cái', 'Cuộn 30m', 'Hộp 500ml', 'Hộp 1L', 'Vỉ 4 viên', 'Cái'],
    units: ['Cái', 'Bộ', 'Hộp', 'Cuộn', 'Gói'],
    minPrice: 15000,
    maxPrice: 350000,
  },
};

function seededRandom(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

async function main() {
  const count = 1000;
  const rand = seededRandom(20261120);
  const categories = Object.keys(CATEGORY_CATALOG);
  const batchSuffix = Date.now().toString().slice(-4);

  const records = [];
  for (let i = 1; i <= count; i++) {
    const category = categories[(i - 1) % categories.length];
    const cfg = CATEGORY_CATALOG[category];

    const item = cfg.items[Math.floor(rand() * cfg.items.length)];
    const brand = cfg.brands[Math.floor(rand() * cfg.brands.length)];
    const variant = cfg.variants[Math.floor(rand() * cfg.variants.length)];
    const unit = cfg.units[Math.floor(rand() * cfg.units.length)];

    const rawPrice =
      cfg.minPrice + rand() * (cfg.maxPrice - cfg.minPrice);
    const price = Math.round(rawPrice / 1000) * 1000;

    // Distribute stock realistically: ~5% out of stock, ~10% low stock (1-10), ~85% normal (11-250)
    const stockRoll = rand();
    let stock: number;
    if (stockRoll < 0.05) {
      stock = 0;
    } else if (stockRoll < 0.15) {
      stock = 1 + Math.floor(rand() * 10);
    } else {
      stock = 11 + Math.floor(rand() * 240);
    }

    const isActive = rand() >= 0.05;
    const sku = `LM-${cfg.prefix}-${batchSuffix}-${String(i).padStart(4, '0')}`;
    const name = `${item} ${brand} ${variant}`;

    records.push({
      sku,
      name,
      category,
      unit,
      price,
      stock,
      isActive,
    });
  }

  const result = await prisma.product.createMany({
    data: records,
    skipDuplicates: true,
  });

  const totalProducts = await prisma.product.count();
  console.log(
    `Inserted ${result.count} products. Total products in database: ${totalProducts}`
  );
}

main()
  .catch((err) => {
    console.error('Failed to seed 1000 products:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
