import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import mercurius from 'mercurius';
import { PrismaClient, TransactionType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const secret = process.env.JWT_SECRET || 'development-secret';
type Context = { userId?: string };
const userFrom = (ctx: Context) => { if (!ctx.userId) throw new Error('Não autenticado'); return ctx.userId; };
const ownedCategory = async (id: string, userId: string) => {
  const category = await prisma.category.findFirst({ where: { id, userId } });
  if (!category) throw new Error('Categoria não encontrada');
  return category;
};

const schema = /* GraphQL */ `
  enum TransactionType { INCOME EXPENSE }
  type User { id: ID!, name: String!, email: String! }
  type AuthPayload { token: String!, user: User! }
  type Category { id: ID!, title: String!, description: String, icon: String!, color: String!, transactionCount: Int! }
  type Transaction { id: ID!, description: String!, amount: Float!, type: TransactionType!, date: String!, category: Category! }
  type Dashboard { balance: Float!, income: Float!, expense: Float!, recentTransactions: [Transaction!]!, categories: [Category!]! }
  input CategoryInput { title: String!, description: String, icon: String, color: String }
  input TransactionInput { description: String!, amount: Float!, type: TransactionType!, date: String!, categoryId: ID! }
  type Query { me: User!, categories: [Category!]!, transactions: [Transaction!]!, dashboard: Dashboard! }
  type Mutation {
    register(name: String!, email: String!, password: String!): AuthPayload!
    login(email: String!, password: String!): AuthPayload!
    updateProfile(name: String!): User!
    createCategory(input: CategoryInput!): Category!
    updateCategory(id: ID!, input: CategoryInput!): Category!
    deleteCategory(id: ID!): Boolean!
    createTransaction(input: TransactionInput!): Transaction!
    updateTransaction(id: ID!, input: TransactionInput!): Transaction!
    deleteTransaction(id: ID!): Boolean!
  }
`;
const categoryShape = (category: any) => ({ ...category, transactionCount: category._count?.transactions ?? 0 });
const resolvers = {
  Category: {
    transactionCount: async (category: any) => category.transactionCount ?? category._count?.transactions ?? prisma.transaction.count({ where: { categoryId: category.id } })
  },
  Transaction: {
    date: (transaction: any) => new Date(transaction.date).toISOString()
  },
  Query: {
    me: async (_: unknown, __: unknown, ctx: Context) => prisma.user.findUniqueOrThrow({ where: { id: userFrom(ctx) }, select: { id: true, name: true, email: true } }),
    categories: async (_: unknown, __: unknown, ctx: Context) => (await prisma.category.findMany({ where: { userId: userFrom(ctx) }, include: { _count: { select: { transactions: true } } }, orderBy: { createdAt: 'desc' } })).map(categoryShape),
    transactions: async (_: unknown, __: unknown, ctx: Context) => prisma.transaction.findMany({ where: { userId: userFrom(ctx) }, include: { category: { include: { _count: { select: { transactions: true } } } } }, orderBy: { date: 'desc' } }),
    dashboard: async (_: unknown, __: unknown, ctx: Context) => {
      const userId = userFrom(ctx); const all = await prisma.transaction.findMany({ where: { userId }, include: { category: { include: { _count: { select: { transactions: true } } } } }, orderBy: { date: 'desc' } });
      const income = all.filter(t => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0); const expense = all.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0);
      const categories = await prisma.category.findMany({ where: { userId }, include: { _count: { select: { transactions: true } } } });
      return { balance: income - expense, income, expense, recentTransactions: all.slice(0, 5), categories: categories.map(categoryShape) };
    }
  },
  Mutation: {
    register: async (_: unknown, { name, email, password }: any) => { if (password.length < 8) throw new Error('A senha precisa ter ao menos 8 caracteres'); const exists = await prisma.user.findUnique({ where: { email } }); if (exists) throw new Error('E-mail já cadastrado'); const user = await prisma.user.create({ data: { name, email, password: await bcrypt.hash(password, 10) }, select: { id: true, name: true, email: true } }); return { user, token: jwt.sign({ userId: user.id }, secret, { expiresIn: '7d' }) }; },
    login: async (_: unknown, { email, password }: any) => { const record = await prisma.user.findUnique({ where: { email } }); if (!record || !(await bcrypt.compare(password, record.password))) throw new Error('E-mail ou senha inválidos'); const user = { id: record.id, name: record.name, email: record.email }; return { user, token: jwt.sign({ userId: user.id }, secret, { expiresIn: '7d' }) }; },
    updateProfile: async (_: unknown, { name }: any, ctx: Context) => prisma.user.update({ where: { id: userFrom(ctx) }, data: { name }, select: { id: true, name: true, email: true } }),
    createCategory: async (_: unknown, { input }: any, ctx: Context) => categoryShape(await prisma.category.create({ data: { ...input, userId: userFrom(ctx) }, include: { _count: { select: { transactions: true } } } })),
    updateCategory: async (_: unknown, { id, input }: any, ctx: Context) => { const userId = userFrom(ctx); await ownedCategory(id, userId); return categoryShape(await prisma.category.update({ where: { id }, data: input, include: { _count: { select: { transactions: true } } } })); },
    deleteCategory: async (_: unknown, { id }: any, ctx: Context) => { await ownedCategory(id, userFrom(ctx)); await prisma.category.delete({ where: { id } }); return true; },
    createTransaction: async (_: unknown, { input }: any, ctx: Context) => { const userId = userFrom(ctx); await ownedCategory(input.categoryId, userId); return prisma.transaction.create({ data: { ...input, type: input.type as TransactionType, date: new Date(input.date), userId }, include: { category: { include: { _count: { select: { transactions: true } } } } } }); },
    updateTransaction: async (_: unknown, { id, input }: any, ctx: Context) => { const userId = userFrom(ctx); const found = await prisma.transaction.findFirst({ where: { id, userId } }); if (!found) throw new Error('Transação não encontrada'); await ownedCategory(input.categoryId, userId); return prisma.transaction.update({ where: { id }, data: { ...input, type: input.type as TransactionType, date: new Date(input.date) }, include: { category: { include: { _count: { select: { transactions: true } } } } } }); },
    deleteTransaction: async (_: unknown, { id }: any, ctx: Context) => { const result = await prisma.transaction.deleteMany({ where: { id, userId: userFrom(ctx) } }); if (!result.count) throw new Error('Transação não encontrada'); return true; }
  }
};
const app = Fastify();
await app.register(cors, { origin: true });
await app.register(mercurius, { schema, resolvers: resolvers as any, context: (req: any): Context => { const header = req.headers.authorization; try { return header?.startsWith('Bearer ') ? jwt.verify(header.slice(7), secret) as Context : {}; } catch { return {}; } }, graphiql: true } as any);
await app.listen({ port: Number(process.env.PORT || 3333), host: '0.0.0.0' });
