export const CHANCE_CARDS = [
  { id: "chance-advance-go", text: "Tiến tới ô GO", type: "advance", target: 0 },
  { id: "chance-advance-illinois", text: "Tiến tới Đại lộ Illinois", type: "advance", target: 24 },
  { id: "chance-advance-stcharles", text: "Tiến tới Phố St. Charles", type: "advance", target: 11 },
  { id: "chance-nearest-utility", text: "Tiến tới tiện ích gần nhất. Nếu có chủ, trả 10x tổng xúc xắc.", type: "nearest_utility" },
  { id: "chance-nearest-railroad", text: "Tiến tới đường sắt gần nhất. Nếu có chủ, trả gấp đôi tiền thuê.", type: "nearest_railroad" },
  { id: "chance-bank-dividend", text: "Ngân hàng trả cổ tức $50", type: "collect", amount: 50 },
  { id: "chance-go-back", text: "Lùi lại 3 ô", type: "back", spaces: 3 },
  { id: "chance-go-jail", text: "Vào tù. Không qua GO, không nhận $200", type: "go_to_jail" },
  { id: "chance-general-repairs", text: "Sửa chữa: Trả $25 mỗi nhà và $100 mỗi khách sạn", type: "repairs", house: 25, hotel: 100 },
  { id: "chance-poor-tax", text: "Đóng thuế $15", type: "pay", amount: 15 },
  { id: "chance-railroad", text: "Đi đến Đường sắt Reading", type: "advance", target: 5 },
  { id: "chance-boardwalk", text: "Đi dạo ở Đường Boardwalk", type: "advance", target: 39 },
  { id: "chance-chairman", text: "Bạn là chủ tịch hội đồng. Trả mỗi người $50", type: "pay_each", amount: 50 },
  { id: "chance-building-loan", text: "Khoản vay đáo hạn. Nhận $150", type: "collect", amount: 150 },
  { id: "chance-crossword", text: "Bạn thắng cuộc thi ô chữ. Nhận $100", type: "collect", amount: 100 },
  { id: "chance-jail-free", text: "Thẻ ra tù miễn phí", type: "jail_free" }
];

export const CHEST_CARDS = [
  { id: "chest-advance-go", text: "Tiến tới ô GO", type: "advance", target: 0 },
  { id: "chest-bank-error", text: "Ngân hàng sai sót có lợi cho bạn. Nhận $200", type: "collect", amount: 200 },
  { id: "chest-doctor", text: "Phí bác sĩ. Trả $50", type: "pay", amount: 50 },
  { id: "chest-sale-stock", text: "Bán cổ phiếu, nhận $50", type: "collect", amount: 50 },
  { id: "chest-jail-free", text: "Thẻ ra tù miễn phí", type: "jail_free" },
  { id: "chest-go-jail", text: "Vào tù. Không qua GO, không nhận $200", type: "go_to_jail" },
  { id: "chest-holiday", text: "Quỹ nghỉ lễ đáo hạn. Nhận $100", type: "collect", amount: 100 },
  { id: "chest-tax-refund", text: "Hoàn thuế. Nhận $20", type: "collect", amount: 20 },
  { id: "chest-birthday", text: "Sinh nhật bạn. Nhận $10 từ mỗi người", type: "collect_each", amount: 10 },
  { id: "chest-life-insurance", text: "Bảo hiểm nhân thọ đáo hạn. Nhận $100", type: "collect", amount: 100 },
  { id: "chest-hospital", text: "Trả viện phí $100", type: "pay", amount: 100 },
  { id: "chest-school", text: "Trả học phí $50", type: "pay", amount: 50 },
  { id: "chest-consultancy", text: "Nhận phí tư vấn $25", type: "collect", amount: 25 },
  { id: "chest-street-repairs", text: "Sửa đường phố: $40 mỗi nhà, $115 mỗi khách sạn", type: "repairs", house: 40, hotel: 115 },
  { id: "chest-beauty", text: "Bạn đạt giải nhì cuộc thi sắc đẹp. Nhận $10", type: "collect", amount: 10 },
  { id: "chest-inherit", text: "Bạn thừa kế $100", type: "collect", amount: 100 }
];
