import { OrderStatus, PaymentMethod, PaymentStatus, PrismaClient } from '@prisma/client';
import { checkDeliveryRadius, MAX_DELIVERY_DISTANCE_KM } from '../src/lib/geo';
import { seedProducts } from '../src/lib/seeder';
import { DELIVERY_HOURS, getVietnamNowParts } from '../src/lib/timeslot';

const prisma = new PrismaClient();

const DEFAULT_ORDER_COUNT = 20;

const LAST_NAMES = [
  'Nguyễn',
  'Trần',
  'Lê',
  'Phạm',
  'Hoàng',
  'Huỳnh',
  'Phan',
  'Vũ',
  'Võ',
  'Đặng',
  'Bùi',
  'Đỗ',
  'Hồ',
  'Ngô',
  'Dương',
  'Lý',
  'Đinh',
  'Trịnh',
  'Đào',
  'Đoàn',
  'Lâm',
  'Trương',
  'Mai',
  'Cao',
  'Lương',
  'Tạ',
  'Chu',
  'Lưu',
  'Châu',
  'Tôn',
  'Quách',
  'Thái',
  'Hà',
  'Tăng',
  'La',
  'Phùng',
  'Vương',
  'Từ',
  'Kiều',
  'Nghiêm',
];

const MALE_MIDDLE_NAMES = [
  'Văn',
  'Minh',
  'Hoàng',
  'Quốc',
  'Gia',
  'Thanh',
  'Hải',
  'Anh',
  'Đức',
  'Quang',
  'Hữu',
  'Công',
  'Xuân',
  'Tuấn',
  'Ngọc',
  'Trung',
  'Tiến',
  'Thành',
  'Đình',
  'Nhật',
  'Bảo',
  'Duy',
  'Khắc',
  'Trọng',
  'Tấn',
  'Phước',
  'Thế',
  'Việt',
];

const FEMALE_MIDDLE_NAMES = [
  'Thị',
  'Ngọc',
  'Thanh',
  'Thu',
  'Minh',
  'Gia',
  'Anh',
  'Phương',
  'Thùy',
  'Khánh',
  'Hoàng',
  'Bảo',
  'Kim',
  'Mỹ',
  'Yến',
  'Hồng',
  'Bích',
  'Diệu',
  'Hải',
  'Lan',
  'Mai',
  'Quỳnh',
  'Tuyết',
  'Xuân',
  'Ánh',
  'Cẩm',
  'Thảo',
  'Trúc',
];

const MALE_FIRST_NAMES = [
  'An',
  'Bình',
  'Cường',
  'Dũng',
  'Hùng',
  'Khánh',
  'Long',
  'Nam',
  'Phúc',
  'Quân',
  'Tuấn',
  'Bảo',
  'Đạt',
  'Đức',
  'Duy',
  'Hải',
  'Hào',
  'Hiếu',
  'Hoàng',
  'Huy',
  'Khang',
  'Khoa',
  'Khôi',
  'Kiên',
  'Kiệt',
  'Lâm',
  'Lộc',
  'Minh',
  'Nghĩa',
  'Nguyên',
  'Nhân',
  'Nhật',
  'Phát',
  'Phong',
  'Phú',
  'Quang',
  'Quốc',
  'Sơn',
  'Tài',
  'Tân',
  'Thái',
  'Thành',
  'Thắng',
  'Thiện',
  'Thịnh',
  'Tiến',
  'Toàn',
  'Trí',
  'Trọng',
  'Trung',
  'Trường',
  'Tú',
  'Tùng',
  'Việt',
  'Vinh',
  'Vũ',
];

const FEMALE_FIRST_NAMES = [
  'Hà',
  'Lan',
  'Linh',
  'Mai',
  'Ngân',
  'Thảo',
  'Trang',
  'Uyên',
  'Vy',
  'An',
  'Anh',
  'Châu',
  'Chi',
  'Diệp',
  'Dung',
  'Duyên',
  'Giang',
  'Hân',
  'Hằng',
  'Hạnh',
  'Hiền',
  'Hoa',
  'Hồng',
  'Huệ',
  'Hương',
  'Huyền',
  'Khánh',
  'Khuê',
  'Kim',
  'Lam',
  'Lệ',
  'Liên',
  'Loan',
  'Ly',
  'My',
  'Nga',
  'Ngọc',
  'Nhi',
  'Nhung',
  'Như',
  'Oanh',
  'Phương',
  'Phượng',
  'Quyên',
  'Quỳnh',
  'Tâm',
  'Thanh',
  'Thơ',
  'Thu',
  'Thư',
  'Thúy',
  'Thủy',
  'Tiên',
  'Trâm',
  'Trinh',
  'Trúc',
  'Tuyền',
  'Tuyết',
  'Vân',
  'Yến',
];

const PHONE_PREFIXES = [
  '090',
  '091',
  '093',
  '094',
  '096',
  '097',
  '098',
  '032',
  '033',
  '034',
  '035',
  '036',
  '037',
  '038',
  '039',
  '056',
  '058',
  '070',
  '076',
  '077',
  '078',
  '079',
  '081',
  '082',
  '083',
  '084',
  '085',
  '086',
  '088',
  '089',
];

interface DistrictLocation {
  district: string;
  wards: string[];
  streets: string[];
  landmarks: string[];
}

const DISTRICT_LOCATIONS: DistrictLocation[] = [
  {
    district: 'Quận 1, TP.HCM',
    wards: [
      'Phường Bến Nghé',
      'Phường Bến Thành',
      'Phường Đa Kao',
      'Phường Tân Định',
      'Phường Nguyễn Thái Bình',
      'Phường Phạm Ngũ Lão',
      'Phường Cô Giang',
    ],
    streets: [
      'Lê Thánh Tôn',
      'Nguyễn Huệ',
      'Hai Bà Trưng',
      'Đồng Khởi',
      'Lý Tự Trọng',
      'Pasteur',
      'Nam Kỳ Khởi Nghĩa',
      'Trần Hưng Đạo',
      'Nguyễn Trãi',
      'Lê Lai',
      'Tôn Đức Thắng',
      'Hàm Nghi',
      'Nguyễn Công Trứ',
      'Đinh Tiên Hoàng',
      'Võ Văn Kiệt',
    ],
    landmarks: [
      'Chung cư Vinhomes Golden River',
      'Tòa nhà Bitexco',
      'Tòa nhà Saigon Centre',
      'Chung cư The Marq',
      'Tòa nhà Deutsches Haus',
      'Chung cư Horizon Tower',
      'Chung cư Central Garden',
    ],
  },
  {
    district: 'Quận 3, TP.HCM',
    wards: [
      'Phường Võ Thị Sáu',
      'Phường 1',
      'Phường 2',
      'Phường 4',
      'Phường 5',
      'Phường 9',
      'Phường 11',
      'Phường 14',
    ],
    streets: [
      'Nguyễn Thị Minh Khai',
      'Võ Văn Tần',
      'Nguyễn Đình Chiểu',
      'Võ Thị Sáu',
      'Cách Mạng Tháng 8',
      'Điện Biên Phủ',
      'Lê Văn Sỹ',
      'Trần Quốc Thảo',
      'Trương Định',
      'Bà Huyện Thanh Quan',
      'Lý Chính Thắng',
      'Hoàng Sa',
    ],
    landmarks: [
      'Chung cư Screc Tower',
      'Tòa nhà Centec Tower',
      'Chung cư Léman Luxury',
      'Chung cư Serenity Sky Villas',
      'Tòa nhà Lim Tower 2',
      'Chung cư Terra Royal',
    ],
  },
  {
    district: 'Quận 4, TP.HCM',
    wards: [
      'Phường 1',
      'Phường 2',
      'Phường 4',
      'Phường 6',
      'Phường 9',
      'Phường 12',
      'Phường 13',
      'Phường 18',
    ],
    streets: [
      'Hoàng Diệu',
      'Nguyễn Khoái',
      'Bến Vân Đồn',
      'Đoàn Văn Bơ',
      'Khánh Hội',
      'Tôn Đản',
      'Tôn Thất Thuyết',
      'Nguyễn Tất Thành',
      'Vĩnh Hội',
    ],
    landmarks: [
      'Chung cư Galaxy 9',
      'Khu căn hộ RiverGate',
      'Chung cư The GoldView',
      'Chung cư Millennium',
      'Chung cư Icon 56',
      'Chung cư Saigon Royal',
      'Chung cư Tresor',
    ],
  },
  {
    district: 'Quận 5, TP.HCM',
    wards: [
      'Phường 1',
      'Phường 2',
      'Phường 4',
      'Phường 7',
      'Phường 9',
      'Phường 11',
      'Phường 14',
    ],
    streets: [
      'An Dương Vương',
      'Nguyễn Trãi',
      'Trần Hưng Đạo',
      'Hồng Bàng',
      'Hùng Vương',
      'Châu Văn Liêm',
      'Nguyễn Văn Cừ',
      'Trần Phú',
      'Nguyễn Chí Thanh',
      'Ngô Quyền',
    ],
    landmarks: [
      'Chung cư The EverRich Infinity',
      'Chung cư Hùng Vương Plaza',
      'Chung cư Tản Đà Court',
      'Tòa nhà Windsor Plaza',
      'Chung cư Golden Plaza',
    ],
  },
  {
    district: 'Quận 6, TP.HCM',
    wards: [
      'Phường 1',
      'Phường 4',
      'Phường 7',
      'Phường 10',
      'Phường 11',
      'Phường 12',
      'Phường 14',
    ],
    streets: [
      'Hậu Giang',
      'Kinh Dương Vương',
      'Hồng Bàng',
      'Minh Phụng',
      'Bình Phú',
      'Lý Chiêu Hoàng',
      'Nguyễn Văn Luông',
      'An Dương Vương',
    ],
    landmarks: [
      'Chung cư Him Lam Chợ Lớn',
      'Chung cư The Western Capital',
      'Chung cư Asiana Capella',
      'Chung cư D-Homme',
      'Chung cư Starlight Riverside',
    ],
  },
  {
    district: 'Quận 7, TP.HCM',
    wards: [
      'Phường Tân Hưng',
      'Phường Tân Phong',
      'Phường Tân Quy',
      'Phường Tân Kiểng',
      'Phường Phú Mỹ',
      'Phường Phú Thuận',
      'Phường Tân Phú',
      'Phường Bình Thuận',
    ],
    streets: [
      'Nguyễn Thị Thập',
      'Nguyễn Hữu Thọ',
      'Nguyễn Văn Linh',
      'Huỳnh Tấn Phát',
      'Lê Văn Lương',
      'Tôn Dật Tiên',
      'Nguyễn Lương Bằng',
      'Lâm Văn Bền',
      'Trần Xuân Soạn',
      'Đào Trí',
      'Hoàng Quốc Việt',
    ],
    landmarks: [
      'Chung cư Sunrise City',
      'Khu dân cư Him Lam',
      'Chung cư Eco Green Sài Gòn',
      'Khu đô thị Phú Mỹ Hưng',
      'Chung cư Riviera Point',
      'Chung cư Scenic Valley',
      'Chung cư Midtown Phú Mỹ Hưng',
      'Chung cư Sunshine City Sài Gòn',
      'Chung cư Florita',
      'Chung cư The Infini',
    ],
  },
  {
    district: 'Quận 8, TP.HCM',
    wards: [
      'Phường 1',
      'Phường 4',
      'Phường 5',
      'Phường 6',
      'Phường 7',
      'Phường 15',
      'Phường 16',
    ],
    streets: [
      'Phạm Thế Hiển',
      'Tạ Quang Bửu',
      'Dương Bá Trạc',
      'Âu Dương Lân',
      'An Dương Vương',
      'Võ Văn Kiệt',
      'Bến Bình Đông',
      'Nguyễn Văn Linh',
    ],
    landmarks: [
      'Chung cư Topaz Elite',
      'Chung cư The Pegasuite',
      'Chung cư Tara Residence',
      'Chung cư Diamond Lotus Riverside',
      'Chung cư City Gate Towers',
    ],
  },
  {
    district: 'Quận 10, TP.HCM',
    wards: [
      'Phường 2',
      'Phường 4',
      'Phường 6',
      'Phường 8',
      'Phường 10',
      'Phường 12',
      'Phường 14',
      'Phường 15',
    ],
    streets: [
      '3 Tháng 2',
      'Tô Hiến Thành',
      'Sư Vạn Hạnh',
      'Lý Thường Kiệt',
      'Thành Thái',
      'Nguyễn Tri Phương',
      'Ngô Gia Tự',
      'Bà Hạt',
      'Cách Mạng Tháng 8',
      'Hòa Hảo',
    ],
    landmarks: [
      'Chung cư Hà Đô Centrosa Garden',
      'Chung cư Kingdom 101',
      'Chung cư Xi Grand Court',
      'Chung cư Rivera Park Sài Gòn',
      'Chung cư Tô Hiến Thành',
    ],
  },
  {
    district: 'Quận 11, TP.HCM',
    wards: [
      'Phường 1',
      'Phường 3',
      'Phường 5',
      'Phường 8',
      'Phường 11',
      'Phường 14',
      'Phường 15',
    ],
    streets: [
      'Lạc Long Quân',
      'Lê Đại Hành',
      'Minh Phụng',
      'Hòa Bình',
      'Ông Ích Khiêm',
      'Bình Thới',
      'Lãnh Binh Thăng',
      '3 Tháng 2',
    ],
    landmarks: [
      'Chung cư The Flemington',
      'Chung cư The Park Avenue',
      'Chung cư Res 11',
      'Chung cư Lữ Gia Plaza',
    ],
  },
  {
    district: 'Quận Bình Thạnh, TP.HCM',
    wards: [
      'Phường 1',
      'Phường 2',
      'Phường 5',
      'Phường 11',
      'Phường 14',
      'Phường 15',
      'Phường 19',
      'Phường 22',
      'Phường 25',
      'Phường 26',
    ],
    streets: [
      'Điện Biên Phủ',
      'Xô Viết Nghệ Tĩnh',
      'Bạch Đằng',
      'Phan Đăng Lưu',
      'Phan Văn Trị',
      'Nguyễn Hữu Cảnh',
      'Ung Văn Khiêm',
      'Nguyễn Gia Trí',
      'Lê Quang Định',
      'Nơ Trang Long',
      'Đinh Bộ Lĩnh',
      'Phạm Văn Đồng',
    ],
    landmarks: [
      'Chung cư Vinhomes Central Park',
      'Chung cư Saigon Pearl',
      'Chung cư Sunwah Pearl',
      'Chung cư City Garden',
      'Chung cư Pearl Plaza',
      'Chung cư The Manor',
      'Chung cư Wilton Tower',
      'Chung cư Richmond City',
    ],
  },
  {
    district: 'Quận Phú Nhuận, TP.HCM',
    wards: [
      'Phường 1',
      'Phường 2',
      'Phường 5',
      'Phường 7',
      'Phường 8',
      'Phường 9',
      'Phường 10',
      'Phường 15',
    ],
    streets: [
      'Phan Xích Long',
      'Phan Đăng Lưu',
      'Nguyễn Văn Trỗi',
      'Hoàng Văn Thụ',
      'Nguyễn Kiệm',
      'Phổ Quang',
      'Huỳnh Văn Bánh',
      'Trần Huy Liệu',
      'Lê Văn Sỹ',
      'Thích Quảng Đức',
    ],
    landmarks: [
      'Chung cư Kingston Residence',
      'Chung cư Orchard Garden',
      'Chung cư Golden Mansion',
      'Chung cư The Prince Residence',
      'Chung cư Newton Residence',
      'Chung cư Garden Gate',
    ],
  },
  {
    district: 'Quận Tân Bình, TP.HCM',
    wards: [
      'Phường 2',
      'Phường 4',
      'Phường 6',
      'Phường 10',
      'Phường 12',
      'Phường 13',
      'Phường 14',
      'Phường 15',
    ],
    streets: [
      'Cộng Hòa',
      'Trường Chinh',
      'Hoàng Văn Thụ',
      'Hoàng Hoa Thám',
      'Lý Thường Kiệt',
      'Lạc Long Quân',
      'Âu Cơ',
      'Bàu Cát',
      'Phổ Quang',
      'Út Tịch',
      'Trường Sơn',
    ],
    landmarks: [
      'Chung cư Botanica Premier',
      'Chung cư Republic Plaza',
      'Chung cư Sky Center',
      'Chung cư Carillon 5',
      'Chung cư The Botanica',
      'Chung cư Harmona',
    ],
  },
  {
    district: 'Quận Tân Phú, TP.HCM',
    wards: [
      'Phường Tân Sơn Nhì',
      'Phường Tây Thạnh',
      'Phường Sơn Kỳ',
      'Phường Tân Quý',
      'Phường Phú Thọ Hòa',
      'Phường Hòa Thạnh',
      'Phường Hiệp Tân',
    ],
    streets: [
      'Lũy Bán Bích',
      'Tân Kỳ Tân Quý',
      'Lê Trọng Tấn',
      'Âu Cơ',
      'Trường Chinh',
      'Thoại Ngọc Hầu',
      'Tân Sơn Nhì',
      'Nguyễn Sơn',
      'Bờ Bao Tân Thắng',
    ],
    landmarks: [
      'Khu đô thị Celadon City',
      'Chung cư RichStar',
      'Chung cư Carillon 7',
      'Chung cư Melody Residences',
      'Chung cư Idico Tân Phú',
    ],
  },
  {
    district: 'Quận Gò Vấp, TP.HCM',
    wards: [
      'Phường 1',
      'Phường 3',
      'Phường 5',
      'Phường 7',
      'Phường 10',
      'Phường 11',
      'Phường 14',
      'Phường 16',
    ],
    streets: [
      'Quang Trung',
      'Nguyễn Oanh',
      'Phan Văn Trị',
      'Lê Đức Thọ',
      'Nguyễn Kiệm',
      'Phạm Văn Chiêu',
      'Thống Nhất',
      'Lê Văn Thọ',
      'Nguyễn Thái Sơn',
      'Dương Quảng Hàm',
    ],
    landmarks: [
      'Khu dân cư CityLand Park Hills',
      'Khu dân cư CityLand Center Hills',
      'Chung cư Hà Đô Green View',
      'Chung cư Dream Home Luxury',
      'Chung cư Osimi Tower',
      'Chung cư Masteri M-One Gia Định',
    ],
  },
  {
    district: 'TP. Thủ Đức, TP.HCM',
    wards: [
      'Phường Thảo Điền',
      'Phường An Phú',
      'Phường Bình Trưng Tây',
      'Phường Hiệp Bình Chánh',
      'Phường Linh Trung',
      'Phường Linh Đông',
      'Phường Phước Long B',
      'Phường Long Thạnh Mỹ',
      'Phường Bình Thọ',
    ],
    streets: [
      'Xa lộ Hà Nội',
      'Mai Chí Thọ',
      'Trần Não',
      'Xuân Thủy',
      'Thảo Điền',
      'Nguyễn Duy Trinh',
      'Đỗ Xuân Hợp',
      'Võ Văn Ngân',
      'Kha Vạn Cân',
      'Phạm Văn Đồng',
      'Lê Văn Việt',
      'Nguyễn Xiển',
      'Đặng Văn Bi',
    ],
    landmarks: [
      'Chung cư Masteri Thảo Điền',
      'Chung cư Vinhomes Grand Park',
      'Chung cư Estella Heights',
      'Chung cư The Sun Avenue',
      'Chung cư Gateway Thảo Điền',
      'Chung cư Opal Riverside',
      'Chung cư Safira Khang Điền',
      'Khu đô thị Sala',
      'Chung cư Empire City',
      'Chung cư Lavita Charm',
    ],
  },
  {
    district: 'Quận Bình Tân, TP.HCM',
    wards: [
      'Phường Bình Trị Đông B',
      'Phường An Lạc',
      'Phường Tân Tạo',
      'Phường Bình Hưng Hòa A',
      'Phường Bình Hưng Hòa B',
    ],
    streets: [
      'Tên Lửa',
      'Kinh Dương Vương',
      'Đường số 7',
      'Tỉnh lộ 10',
      'Lê Văn Quới',
      'Hương lộ 2',
      'Mã Lò',
      'Võ Văn Kiệt',
    ],
    landmarks: [
      'Chung cư Akari City',
      'Chung cư Moonlight Park View',
      'Chung cư Moonlight Boulevard',
      'Chung cư Imperial Place',
      'Chung cư Aio City',
    ],
  },
  {
    district: 'Huyện Nhà Bè, TP.HCM',
    wards: [
      'Xã Phước Kiển',
      'Xã Phước Lộc',
      'Xã Nhơn Đức',
      'Thị trấn Nhà Bè',
      'Xã Phú Xuân',
    ],
    streets: [
      'Nguyễn Hữu Thọ',
      'Lê Văn Lương',
      'Huỳnh Tấn Phát',
      'Phạm Hữu Lầu',
      'Nguyễn Bình',
      'Đào Sư Tích',
    ],
    landmarks: [
      'Chung cư Sunrise Riverside',
      'Chung cư Saigon South Residences',
      'Chung cư Goldora Plaza',
      'Chung cư Celesta Rise',
      'Khu dân cư Dragon Parc',
    ],
  },
  {
    district: 'Huyện Bình Chánh, TP.HCM',
    wards: [
      'Xã Bình Hưng',
      'Xã Phong Phú',
      'Xã Vĩnh Lộc A',
      'Xã Tân Kiên',
      'Thị trấn Tân Túc',
    ],
    streets: [
      'Nguyễn Văn Linh',
      'Phạm Hùng',
      'Quốc lộ 50',
      'Trịnh Quang Nghị',
      'Đường số 9A',
      'Võ Văn Kiệt',
    ],
    landmarks: [
      'Khu dân cư Trung Sơn',
      'Chung cư Mia Trung Sơn',
      'Chung cư Mizuki Park',
      'Chung cư Lovera Vista',
      'Chung cư Westgate Bình Chánh',
    ],
  },
];

const APARTMENT_BLOCKS = ['Block A', 'Block B', 'Block C', 'Tháp 1', 'Tháp 2', 'Tháp A', 'Tháp B', 'Sảnh A', 'Sảnh B'];

function parseOrderCount(argv: string[]): number {
  let rawCount: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(
        `Usage: npm run seed:orders -- [count]\n` +
          `       npm run seed:orders -- --count <number>\n\n` +
          `Options:\n` +
          `  count, -n, --count   Number of sample orders to seed (default: ${DEFAULT_ORDER_COUNT})`
      );
      process.exit(0);
    } else if (arg === '--count' || arg === '-n') {
      rawCount = argv[++i];
    } else if (arg.startsWith('--count=')) {
      rawCount = arg.slice('--count='.length);
    } else if (arg.startsWith('-n=')) {
      rawCount = arg.slice('-n='.length);
    } else if (!arg.startsWith('-') && rawCount === undefined) {
      rawCount = arg;
    }
  }

  if (rawCount === undefined) {
    return DEFAULT_ORDER_COUNT;
  }

  const parsed = Number(rawCount);
  if (!Number.isInteger(parsed) || parsed < 1) {
    console.error(
      `Invalid order count: "${rawCount}". Please provide a positive integer (default: ${DEFAULT_ORDER_COUNT}).`
    );
    process.exit(1);
  }

  return parsed;
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateCoordinatesNearStore(
  storeLat: number,
  storeLng: number
): { latitude: number; longitude: number } {
  const maxKm = Math.max(1, MAX_DELIVERY_DISTANCE_KM - 0.5);
  const minKm = 0.4;

  for (let attempt = 0; attempt < 10; attempt++) {
    const distanceKm = minKm + Math.sqrt(Math.random()) * (maxKm - minKm);
    const angle = Math.random() * 2 * Math.PI;
    const dLat = (distanceKm * Math.cos(angle)) / 111.32;
    const cosLat = Math.cos((storeLat * Math.PI) / 180);
    const dLng = (distanceKm * Math.sin(angle)) / (111.32 * Math.max(0.1, cosLat));

    const latitude = Number((storeLat + dLat).toFixed(6));
    const longitude = Number((storeLng + dLng).toFixed(6));

    if (checkDeliveryRadius(storeLat, storeLng, latitude, longitude).ok) {
      return { latitude, longitude };
    }
  }

  return {
    latitude: Number((storeLat + 0.005).toFixed(6)),
    longitude: Number((storeLng + 0.005).toFixed(6)),
  };
}

function generateCustomerName(): string {
  const isMale = Math.random() < 0.5;
  const lastName = pickRandom(LAST_NAMES);
  const middleNames = isMale ? MALE_MIDDLE_NAMES : FEMALE_MIDDLE_NAMES;
  const firstNames = isMale ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES;

  const middleName = pickRandom(middleNames);
  let firstName = pickRandom(firstNames);
  if (firstName === middleName) {
    firstName = pickRandom(firstNames.filter((name) => name !== middleName));
  }

  return `${lastName} ${middleName} ${firstName}`;
}

function generatePhoneNumber(): string {
  const prefix = pickRandom(PHONE_PREFIXES);
  const suffix = String(randomInt(0, 9999999)).padStart(7, '0');
  return `${prefix}${suffix}`;
}

const WEIGHTED_PAYMENT_METHODS: PaymentMethod[] = [
  PaymentMethod.COD,
  PaymentMethod.COD,
  PaymentMethod.COD,
  PaymentMethod.COD,
  PaymentMethod.MOMO,
  PaymentMethod.MOMO,
  PaymentMethod.CREDIT_CARD,
  PaymentMethod.CREDIT_CARD,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.VNPAY,
  PaymentMethod.ZALOPAY,
];

function generatePaymentInfo(seq: number, batchSuffix: string): {
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paidAt: Date | null;
  paymentReference: string | null;
} {
  const paymentMethod = pickRandom(WEIGHTED_PAYMENT_METHODS);
  if (paymentMethod === PaymentMethod.COD) {
    return {
      paymentMethod,
      paymentStatus: PaymentStatus.UNPAID,
      paidAt: null,
      paymentReference: null,
    };
  }
  const isPendingTransfer =
    paymentMethod === PaymentMethod.BANK_TRANSFER && Math.random() < 0.3;
  if (isPendingTransfer) {
    return {
      paymentMethod,
      paymentStatus: PaymentStatus.UNPAID,
      paidAt: null,
      paymentReference: null,
    };
  }
  const prefixMap: Record<Exclude<PaymentMethod, 'COD'>, string> = {
    CREDIT_CARD: 'CC',
    MOMO: 'MOMO',
    BANK_TRANSFER: 'FT',
    ZALOPAY: 'ZP',
    VNPAY: 'VNP',
  };
  return {
    paymentMethod,
    paymentStatus: PaymentStatus.PAID,
    paidAt: new Date(),
    paymentReference: `${prefixMap[paymentMethod]}-${batchSuffix}-${String(seq).padStart(4, '0')}`,
  };
}

function generateAddress(): string {
  const location = pickRandom(DISTRICT_LOCATIONS);
  const ward = pickRandom(location.wards);
  const street = pickRandom(location.streets);
  const houseNo = randomInt(1, 520);
  const roll = Math.random();

  if (roll < 0.35) {
    return `${houseNo} ${street}, ${ward}, ${location.district}`;
  }

  if (roll < 0.6) {
    const subNo = randomInt(1, 80);
    const alley = Math.random() < 0.3 ? `${houseNo}/${subNo}/${randomInt(1, 30)}` : `${houseNo}/${subNo}`;
    return `${alley} ${street}, ${ward}, ${location.district}`;
  }

  const landmark = pickRandom(location.landmarks);
  const isApartment = landmark.startsWith('Chung cư') || landmark.startsWith('Khu căn hộ');
  const blockSuffix =
    isApartment && Math.random() < 0.5 ? ` (${pickRandom(APARTMENT_BLOCKS)})` : '';

  return `${landmark}${blockSuffix}, ${houseNo} ${street}, ${ward}, ${location.district}`;
}

async function main() {
  const count = parseOrderCount(process.argv.slice(2));

  let stores = await prisma.store.findMany({
    where: { isActive: true },
    orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
  });
  if (stores.length === 0) {
    stores = await prisma.store.findMany({
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
    });
  }
  if (stores.length === 0) {
    console.error('No stores (depots) found in database. Please run "npm run seed" first.');
    process.exit(1);
  }

  let products = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, sku: true, name: true, price: true },
  });
  if (products.length === 0) {
    products = await prisma.product.findMany({
      select: { id: true, sku: true, name: true, price: true },
    });
  }
  if (products.length === 0) {
    console.log('No products found. Seeding default sample products...');
    const seeded = await seedProducts(prisma);
    products = seeded.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      price: p.price,
    }));
  }

  const batchSuffix = Date.now().toString().slice(-6);
  const chunkSize = 20;
  let createdCount = 0;

  for (let offset = 0; offset < count; offset += chunkSize) {
    const batchEnd = Math.min(offset + chunkSize, count);
    const operations = [];

    for (let i = offset; i < batchEnd; i++) {
      const seq = i + 1;
      const store = stores[i % stores.length];
      const { latitude, longitude } = generateCoordinatesNearStore(
        store.latitude,
        store.longitude
      );

      const itemCount = randomInt(1, Math.min(4, products.length));
      const pickedIndices = new Set<number>();
      while (pickedIndices.size < itemCount) {
        pickedIndices.add(Math.floor(Math.random() * products.length));
      }

      const orderItems = Array.from(pickedIndices).map((idx) => {
        const prod = products[idx];
        return {
          productId: prod.id,
          sku: prod.sku,
          productName: prod.name,
          quantity: randomInt(1, 4),
          price: Number(prod.price),
        };
      });

      const totalAmount = orderItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      const orderCode = `ORD-${batchSuffix}-${String(seq).padStart(4, '0')}`;
      const paymentInfo = generatePaymentInfo(seq, batchSuffix);
      const { deliveryDate: todayDeliveryDate } = getVietnamNowParts();
      const hourDelivery =
        DELIVERY_HOURS[Math.floor(Math.random() * DELIVERY_HOURS.length)];

      operations.push(
        prisma.order.create({
          data: {
            orderCode,
            storeId: store.id,
            customerName: generateCustomerName(),
            customerPhone: generatePhoneNumber(),
            customerAddress: generateAddress(),
            latitude,
            longitude,
            totalAmount,
            paymentMethod: paymentInfo.paymentMethod,
            paymentStatus: paymentInfo.paymentStatus,
            paidAt: paymentInfo.paidAt,
            paymentReference: paymentInfo.paymentReference,
            deliveryDate: todayDeliveryDate,
            hourDelivery,
            status: OrderStatus.NEW,
            items: {
              create: orderItems,
            },
          },
        })
      );
    }

    const created = await prisma.$transaction(operations);
    createdCount += created.length;
  }

  const totalOrders = await prisma.order.count();
  console.log(
    `Seeded ${createdCount} order(s) across ${stores.length} store(s). Total orders in database: ${totalOrders}`
  );
}

main()
  .catch((err) => {
    console.error('Failed to seed orders:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
