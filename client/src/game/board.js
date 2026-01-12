export const BOARD = [
  { id: 0, name: "GO", type: "go" },
  { id: 1, name: "Đại lộ Địa Trung Hải", type: "property", color: "brown", price: 140, rent: [30, 100, 300, 600, 900, 1200], houseCost: 50, mortgage: 30 },
  { id: 2, name: "Rương kho báu", type: "chest" },
  { id: 3, name: "Đại lộ Baltic", type: "property", color: "brown", price: 140, rent: [30, 120, 320, 650, 950, 1250], houseCost: 50, mortgage: 30 },
  { id: 4, name: "Hình phạt", type: "tax", amount: 200 },
  { id: 5, name: "Đường sắt Reading", type: "railroad", price: 300, rent: [50, 100, 200, 400], mortgage: 100 },
  { id: 6, name: "Đại lộ Oriental", type: "property", color: "lightblue", price: 150, rent: [40, 150, 450, 1000, 1300, 1600], houseCost: 50, mortgage: 50 },
  { id: 7, name: "Cơ hội", type: "chance" },
  { id: 8, name: "Đại lộ Vermont", type: "property", color: "lightblue", price: 150, rent: [40, 150, 450, 1000, 1300, 1600], houseCost: 50, mortgage: 50 },
  { id: 9, name: "Đại lộ Connecticut", type: "property", color: "lightblue", price: 180, rent: [45, 180, 500, 1100, 1400, 1700], houseCost: 50, mortgage: 60 },
  { id: 10, name: "Nhà tù / Chỉ thăm", type: "jail" },
  { id: 11, name: "Phố St. Charles", type: "property", color: "pink", price: 210, rent: [50, 200, 600, 1100, 1500, 1900], houseCost: 100, mortgage: 70 },
  { id: 12, name: "Công ty Điện", type: "utility", price: 225, mortgage: 75 },
  { id: 13, name: "Đại lộ States", type: "property", color: "pink", price: 210, rent: [50, 200, 600, 1100, 1500, 1900], houseCost: 100, mortgage: 70 },
  { id: 14, name: "Đại lộ Virginia", type: "property", color: "pink", price: 240, rent: [55, 220, 650, 1200, 1600, 2000], houseCost: 100, mortgage: 80 },
  { id: 15, name: "Đường sắt Pennsylvania", type: "railroad", price: 300, rent: [50, 100, 200, 400], mortgage: 100 },
  { id: 16, name: "Phố St. James", type: "property", color: "orange", price: 270, rent: [60, 250, 750, 1200, 1600, 2000], houseCost: 100, mortgage: 90 },
  { id: 17, name: "Thử thách", type: "challenge" },
  { id: 18, name: "Đại lộ Tennessee", type: "property", color: "orange", price: 270, rent: [60, 250, 750, 1200, 1600, 2000], houseCost: 100, mortgage: 90 },
  { id: 19, name: "Đại lộ New York", type: "property", color: "orange", price: 300, rent: [65, 280, 800, 1300, 1700, 2100], houseCost: 100, mortgage: 100 },
  { id: 20, name: "Đỗ xe miễn phí", type: "free_parking" },
  { id: 21, name: "Đại lộ Kentucky", type: "property", color: "red", price: 330, rent: [70, 300, 850, 1300, 1750, 2200], houseCost: 150, mortgage: 110 },
  { id: 22, name: "Thử thách", type: "challenge" },
  { id: 23, name: "Đại lộ Indiana", type: "property", color: "red", price: 330, rent: [70, 300, 850, 1300, 1750, 2200], houseCost: 150, mortgage: 110 },
  { id: 24, name: "Đại lộ Illinois", type: "property", color: "red", price: 360, rent: [75, 320, 900, 1400, 1850, 2300], houseCost: 150, mortgage: 120 },
  { id: 25, name: "Đường sắt B. & O.", type: "railroad", price: 300, rent: [50, 100, 200, 400], mortgage: 100 },
  { id: 26, name: "Đại lộ Atlantic", type: "property", color: "yellow", price: 390, rent: [80, 350, 950, 1400, 1850, 2300], houseCost: 150, mortgage: 130 },
  { id: 27, name: "Đại lộ Ventnor", type: "property", color: "yellow", price: 390, rent: [80, 350, 950, 1400, 1850, 2300], houseCost: 150, mortgage: 130 },
  { id: 28, name: "Nhà máy Nước", type: "utility", price: 225, mortgage: 75 },
  { id: 29, name: "Vườn Marvin", type: "property", color: "yellow", price: 420, rent: [85, 380, 1000, 1500, 1950, 2400], houseCost: 150, mortgage: 140 },
  { id: 30, name: "Vào tù", type: "go_to_jail" },
  { id: 31, name: "Đại lộ Pacific", type: "property", color: "green", price: 450, rent: [90, 400, 1100, 1500, 2000, 2500], houseCost: 200, mortgage: 150 },
  { id: 32, name: "Đại lộ Bắc Carolina", type: "property", color: "green", price: 450, rent: [90, 400, 1100, 1500, 2000, 2500], houseCost: 200, mortgage: 150 },
  { id: 33, name: "Rương kho báu", type: "chest" },
  { id: 34, name: "Đại lộ Pennsylvania", type: "property", color: "green", price: 480, rent: [95, 450, 1200, 1600, 2100, 2600], houseCost: 200, mortgage: 160 },
  { id: 35, name: "Đường sắt Short Line", type: "railroad", price: 300, rent: [50, 100, 200, 400], mortgage: 100 },
  { id: 36, name: "Cơ hội", type: "chance" },
  { id: 37, name: "Khu Park Place", type: "property", color: "darkblue", price: 525, rent: [120, 500, 1300, 1700, 2200, 3000], houseCost: 200, mortgage: 175 },
  { id: 38, name: "Hình phạt", type: "tax", amount: 100 },
  { id: 39, name: "Đường Boardwalk", type: "property", color: "darkblue", price: 600, rent: [150, 600, 1400, 2000, 2600, 3500], houseCost: 200, mortgage: 200 }
];

export const GROUPS = {
  brown: [1, 3],
  lightblue: [6, 8, 9],
  pink: [11, 13, 14],
  orange: [16, 18, 19],
  red: [21, 23, 24],
  yellow: [26, 27, 29],
  green: [31, 32, 34],
  darkblue: [37, 39]
};

export const RAILROADS = [5, 15, 25, 35];
export const UTILITIES = [12, 28];

export const LIQUIDITY = {
  brown: 1.0,
  lightblue: 1.05,
  pink: 1.1,
  orange: 1.15,
  red: 1.2,
  yellow: 1.25,
  green: 1.3,
  darkblue: 1.35,
  railroads: 1.1,
  utilities: 1.05
};

export const PENALTIES = [
  "Hát song ca cơn mưa tình yêu (yêu cầu một nam và một nữ bất kì trong nhóm)",
  "Nhảy hot trend tik tok",
  "Chống đẩy 15 cái",
  "Squat 20 cái",
  "Hát bài hát bất kì"
];
