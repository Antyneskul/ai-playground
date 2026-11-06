export type ItemStatus = "pending_review" | "approved" | "rejected" | "executed";

export interface Item {
  id: string;
  message: string;
  status: ItemStatus;
  createdAt: string;
  updatedAt: string;
}

export interface State {
  nextId: number;
  items: Item[];
}
