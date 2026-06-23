export interface IUser {
  _id: string;
  username: string;
  totpEnabled: boolean;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}
