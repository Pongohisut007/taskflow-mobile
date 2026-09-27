import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { CartItem } from './cart-item.entity';

// ตะกร้าเก็บแค่ว่าเป็นของใคร ของที่อยู่ข้างในแยกไปไว้ cart_items (1:N)
@Entity('carts')
export class Cart extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, (user) => user.cart, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @OneToMany(() => CartItem, (item) => item.cart, { cascade: ['insert'] })
  items!: CartItem[];
}
