import { PrismaClient, Role, OrderStatus } from '@prisma/client';

const SAMPLE_PRODUCTS = [
  { sku: 'LM-DAIRY-001', name: 'Sữa tươi Tiệt trùng Vinamilk 1L', category: 'Sữa & Đồ uống', unit: 'Hộp', price: 35000, stock: 120 },
  { sku: 'LM-MEAT-001', name: 'Thịt ba rọi heo CP 500g', category: 'Thực phẩm tươi sống', unit: 'Khay', price: 90000, stock: 45 },
  { sku: 'LM-DRY-001', name: 'Gạo ST25 Ông Cua 5kg', category: 'Thực phẩm khô', unit: 'Túi', price: 195000, stock: 60 },
  { sku: 'LM-DRY-002', name: 'Dầu ăn Neptune Light 2L', category: 'Thực phẩm khô', unit: 'Chai', price: 90000, stock: 85 },
  { sku: 'LM-FRESH-001', name: 'Trứng gà Ba Huân Hộp 10 quả', category: 'Thực phẩm tươi sống', unit: 'Hộp', price: 35000, stock: 95 },
  { sku: 'LM-FRESH-002', name: 'Rau cải ngọt hữu cơ 500g', category: 'Rau củ & Trái cây', unit: 'Gói', price: 20000, stock: 50 },
  { sku: 'LM-HOME-001', name: 'Nước giặt Ariel Matic 3.2kg', category: 'Hóa mỹ phẩm', unit: 'Túi', price: 210000, stock: 30 },
  { sku: 'LM-HOME-002', name: 'Nước xả Downy Huyền Bí 1.8L', category: 'Hóa mỹ phẩm', unit: 'Túi', price: 110000, stock: 40 },
  { sku: 'LM-MEAT-002', name: 'Cá hồi Nauy phi lê tươi 500g', category: 'Thực phẩm tươi sống', unit: 'Khay', price: 260000, stock: 8 },
  { sku: 'LM-FRESH-003', name: 'Salad trộn Đà Lạt 300g', category: 'Rau củ & Trái cây', unit: 'Hộp', price: 50000, stock: 28 },
  { sku: 'LM-DRY-003', name: 'Thùng mì Hảo Hảo Tôm Chua Cay', category: 'Thực phẩm khô', unit: 'Thùng', price: 120000, stock: 75 },
  { sku: 'LM-DRINK-001', name: 'Lốc 6 lon Coca-Cola 320ml', category: 'Sữa & Đồ uống', unit: 'Lốc', price: 56000, stock: 110 },
  { sku: 'LM-FRUIT-001', name: 'Táo Envy New Zealand 1kg', category: 'Rau củ & Trái cây', unit: 'Kg', price: 165000, stock: 18 },
  { sku: 'LM-MEAT-003', name: 'Thịt bò Úc xay 500g', category: 'Thực phẩm tươi sống', unit: 'Khay', price: 145000, stock: 9 },
  { sku: 'LM-DRINK-002', name: 'Bia Heineken Silver Thùng 24 lon', category: 'Sữa & Đồ uống', unit: 'Thùng', price: 440000, stock: 24 },
  { sku: 'LM-DRY-004', name: 'Cà phê rang xay Trung Nguyên 500g', category: 'Sữa & Đồ uống', unit: 'Gói', price: 135000, stock: 55 },
];

export async function seedProducts(prisma: PrismaClient) {
  const products = [];
  for (const prod of SAMPLE_PRODUCTS) {
    const item = await prisma.product.upsert({
      where: { sku: prod.sku },
      update: {},
      create: prod,
    });
    products.push(item);
  }
  return products;
}

export async function runSeed(prisma: PrismaClient, resetOrders = true) {
  // 1. Tạo Store (Depot - Lotte Mart Quận 7, TP.HCM)
  const store = await prisma.store.upsert({
    where: { id: 1 },
    update: {
      name: 'Lotte Mart Quận 7 (Depot)',
      address: '469 Nguyễn Hữu Thọ, Tân Hưng, Quận 7, TP.HCM',
      latitude: 10.7423,
      longitude: 106.7024,
    },
    create: {
      id: 1,
      name: 'Lotte Mart Quận 7 (Depot)',
      address: '469 Nguyễn Hữu Thọ, Tân Hưng, Quận 7, TP.HCM',
      latitude: 10.7423,
      longitude: 106.7024,
    },
  });

  // 2. Tạo 3 Users tương ứng 3 Roles
  const admin = await prisma.user.upsert({
    where: { email: 'admin@dms.vn' },
    update: { name: 'Quản lý Điều phối', role: Role.ADMIN },
    create: { email: 'admin@dms.vn', password: '123', name: 'Quản lý Điều phối', role: Role.ADMIN },
  });
  const warehouse = await prisma.user.upsert({
    where: { email: 'kho@dms.vn' },
    update: { name: 'Nhân viên Kho', role: Role.WAREHOUSE },
    create: { email: 'kho@dms.vn', password: '123', name: 'Nhân viên Kho', role: Role.WAREHOUSE },
  });
  const driver = await prisma.user.upsert({
    where: { email: 'taixe@dms.vn' },
    update: { name: 'Tài xế Nguyễn Văn A', role: Role.DRIVER },
    create: { email: 'taixe@dms.vn', password: '123', name: 'Tài xế Nguyễn Văn A', role: Role.DRIVER },
  });

  if (resetOrders) {
    await prisma.orderItem.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.trip.deleteMany({});
  }

  // 3. Tạo 10 Đơn hàng mẫu nằm rải rác xung quanh Kho (Quận 7, Quận 4, Nhà Bè)
  const sampleOrders = [
    {
      code: 'ORD-101',
      name: 'Nguyễn Văn B',
      phone: '0901111222',
      addr: 'Khu dân cư Him Lam, Tân Hưng, Quận 7',
      lat: 10.7480,
      lng: 106.6980,
      amount: 250000,
      items: [
        { productName: 'Sữa tươi Tiệt trùng Vinamilk 1L', quantity: 2, price: 35000 },
        { productName: 'Thịt ba rọi heo CP 500g', quantity: 2, price: 90000 },
      ],
    },
    {
      code: 'ORD-102',
      name: 'Trần Thị C',
      phone: '0903333444',
      addr: 'Chung cư Sunrise City, Nguyễn Hữu Thọ, Quận 7',
      lat: 10.7450,
      lng: 106.7050,
      amount: 480000,
      items: [
        { productName: 'Gạo ST25 Ông Cua 5kg', quantity: 2, price: 195000 },
        { productName: 'Dầu ăn Neptune Light 2L', quantity: 1, price: 90000 },
      ],
    },
    {
      code: 'ORD-103',
      name: 'Lê Hoàng D',
      phone: '0905555666',
      addr: '300 Nguyễn Thị Thập, Tân Quy, Quận 7',
      lat: 10.7380,
      lng: 106.7110,
      amount: 150000,
      items: [
        { productName: 'Trứng gà Ba Huân Hộp 10 quả', quantity: 2, price: 35000 },
        { productName: 'Rau cải ngọt hữu cơ 500g', quantity: 4, price: 20000 },
      ],
    },
    {
      code: 'ORD-104',
      name: 'Phạm Minh E',
      phone: '0907777888',
      addr: 'Chung cư Galaxy 9, Nguyễn Khoái, Quận 4',
      lat: 10.7550,
      lng: 106.6990,
      amount: 320000,
      items: [
        { productName: 'Nước giặt Ariel Matic 3.2kg', quantity: 1, price: 210000 },
        { productName: 'Nước xả Downy Huyền Bí 1.8L', quantity: 1, price: 110000 },
      ],
    },
    {
      code: 'ORD-105',
      name: 'Đỗ Hải F',
      phone: '0909999000',
      addr: 'Khu đô thị Phú Mỹ Hưng, Tân Phong, Quận 7',
      lat: 10.7290,
      lng: 106.7180,
      amount: 620000,
      items: [
        { productName: 'Cá hồi Nauy phi lê tươi 500g', quantity: 2, price: 260000 },
        { productName: 'Salad trộn Đà Lạt 300g', quantity: 2, price: 50000 },
      ],
    },
    {
      code: 'ORD-106',
      name: 'Vũ Thị Thu G',
      phone: '0912223344',
      addr: 'Khu chế xuất Tân Thuận, Quận 7',
      lat: 10.7520,
      lng: 106.7260,
      amount: 290000,
      items: [
        { productName: 'Thùng mì Hảo Hảo Tôm Chua Cay', quantity: 1, price: 120000 },
        { productName: 'Lốc 6 lon Coca-Cola 320ml', quantity: 3, price: 56666 },
      ],
    },
    {
      code: 'ORD-107',
      name: 'Hoàng Gia H',
      phone: '0914445566',
      addr: 'Chung cư Eco Green Sài Gòn, Nguyễn Văn Linh, Quận 7',
      lat: 10.7445,
      lng: 106.7195,
      amount: 410000,
      items: [
        { productName: 'Táo Envy New Zealand 1kg', quantity: 2, price: 165000 },
        { productName: 'Sữa chua uống Yakult (Lốc 5)', quantity: 3, price: 26666 },
      ],
    },
    {
      code: 'ORD-108',
      name: 'Bùi Thanh I',
      phone: '0916667788',
      addr: '120 Lê Văn Lương, Phước Kiển, Nhà Bè',
      lat: 10.7235,
      lng: 106.7015,
      amount: 375000,
      items: [
        { productName: 'Thịt bò Úc xay 500g', quantity: 2, price: 145000 },
        { productName: 'Mì Ý Barilla Số 5 500g', quantity: 2, price: 42500 },
      ],
    },
    {
      code: 'ORD-109',
      name: 'Đặng Quốc K',
      phone: '0918889900',
      addr: '85 Hoàng Diệu, Phường 12, Quận 4',
      lat: 10.7610,
      lng: 106.7045,
      amount: 540000,
      items: [
        { productName: 'Bia Heineken Silver Thùng 24 lon', quantity: 1, price: 440000 },
        { productName: 'Khô gà lá chanh 250g', quantity: 1, price: 100000 },
      ],
    },
    {
      code: 'ORD-110',
      name: 'Ngô Minh L',
      phone: '0931122334',
      addr: 'Crescent Mall, Tôn Dật Tiên, Quận 7',
      lat: 10.7295,
      lng: 106.7085,
      amount: 195000,
      items: [
        { productName: 'Cà phê rang xay Trung Nguyên 500g', quantity: 1, price: 135000 },
        { productName: 'Sữa đặc Ông Thọ Đỏ 380g', quantity: 2, price: 30000 },
      ],
    },
  ];

  const createdOrders = [];
  for (const ord of sampleOrders) {
    const order = await prisma.order.upsert({
      where: { orderCode: ord.code },
      update: {
        status: OrderStatus.NEW,
        tripId: null,
        deliverySequence: null,
      },
      create: {
        orderCode: ord.code,
        storeId: store.id,
        customerName: ord.name,
        customerPhone: ord.phone,
        customerAddress: ord.addr,
        latitude: ord.lat,
        longitude: ord.lng,
        totalAmount: ord.amount,
        status: OrderStatus.NEW,
        items: {
          create: ord.items,
        },
      },
      include: { items: true },
    });
    createdOrders.push(order);
  }

  const seededProducts = await seedProducts(prisma);

  return {
    store,
    users: [admin, warehouse, driver],
    ordersCount: createdOrders.length,
    productsCount: seededProducts.length,
    orders: createdOrders,
  };
}
