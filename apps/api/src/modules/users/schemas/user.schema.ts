import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  username: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ type: String, default: null })
  totpSecret: string | null;

  @Prop({ default: false })
  totpEnabled: boolean;

  @Prop({ default: 'admin' })
  role: string;

  @Prop({ default: false })
  mustChangePassword: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.set('toJSON', {
  transform: (_doc, ret: any) => {
    delete ret.passwordHash;
    delete ret.totpSecret;
    return ret;
  },
});
