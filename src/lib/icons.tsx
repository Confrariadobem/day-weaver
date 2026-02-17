import {
  Cake, CalendarDays, CircleDollarSign, TrendingUp, FolderKanban, Flag,
  CheckSquare, Tag, PiggyBank, BarChart3, Wallet, Building2,
  LayoutDashboard, User, Settings, LogOut, Sparkles,
  Home, Car, Utensils, Pill, BookOpen, Gamepad2, Plane, Gift,
  ShoppingCart, Target, Zap, Wrench, Smartphone, Music, Dumbbell,
  Clapperboard, Shirt, Dog, Sprout, Coffee, Briefcase, Landmark,
  CreditCard, WalletCards, Banknote, Bitcoin, Database,
  DollarSign, Coins, BadgeDollarSign, Receipt,
} from "lucide-react";
import React from "react";

// ─── Centralized icon registry ───
// All modules reference this map for consistent icons across the system.

const ICON_SIZE_SM = "h-4 w-4";
const ICON_SIZE_MD = "h-5 w-5";
const ICON_SIZE_LG = "h-6 w-6";

// Module navigation icons
export const MODULE_ICONS: Record<string, React.ReactNode> = {
  dashboard: <LayoutDashboard className={ICON_SIZE_MD} />,
  calendar: <CalendarDays className={ICON_SIZE_MD} />,
  finances: <BadgeDollarSign className={ICON_SIZE_MD} />,
  programs: <FolderKanban className={ICON_SIZE_MD} />,
  investments: <TrendingUp className={ICON_SIZE_MD} />,
  patrimonio: <Building2 className={ICON_SIZE_MD} />,
  profile: <User className={ICON_SIZE_MD} />,
  preferences: <Settings className={ICON_SIZE_MD} />,
};

// Launch type icons (Central de Lançamentos + Preferências => Tipos)
export const LAUNCH_TYPE_ICONS: Record<string, React.ReactNode> = {
  "Aniversário": <Cake className={ICON_SIZE_MD} />,
  "Evento": <CalendarDays className={ICON_SIZE_MD} />,
  "Fluxo de Caixa": <BadgeDollarSign className={ICON_SIZE_MD} />,
  "Investimento": <TrendingUp className={ICON_SIZE_MD} />,
  "Projetos": <FolderKanban className={ICON_SIZE_MD} />,
  "Feriado": <Flag className={ICON_SIZE_MD} />,
};

// Event type icons for EventEditDialog
export const EVENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  birthday: <Cake className={ICON_SIZE_SM} />,
  event: <CalendarDays className={ICON_SIZE_SM} />,
  cashflow: <BadgeDollarSign className={ICON_SIZE_SM} />,
  investment: <TrendingUp className={ICON_SIZE_SM} />,
  project: <FolderKanban className={ICON_SIZE_SM} />,
};

// Data module icons (Preferências => Dados)
export const DATA_MODULE_ICONS: Record<string, React.ReactNode> = {
  calendar_events: <CalendarDays className={ICON_SIZE_MD} />,
  categories: <Tag className={ICON_SIZE_MD} />,
  financial_accounts: <Landmark className={ICON_SIZE_MD} />,
  financial_entries: <BadgeDollarSign className={ICON_SIZE_MD} />,
  investments: <TrendingUp className={ICON_SIZE_MD} />,
  profiles: <User className={ICON_SIZE_MD} />,
  project_phases: <FolderKanban className={ICON_SIZE_MD} />,
  project_resources: <User className={ICON_SIZE_MD} />,
  projects: <FolderKanban className={ICON_SIZE_MD} />,
  tasks: <CheckSquare className={ICON_SIZE_MD} />,
};

// Investment type icons
export const INVESTMENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  stock: <TrendingUp className={ICON_SIZE_MD} />,
  fii: <Building2 className={ICON_SIZE_MD} />,
  crypto: <Bitcoin className={ICON_SIZE_MD} />,
  fixed_income: <PiggyBank className={ICON_SIZE_MD} />,
  etf: <BarChart3 className={ICON_SIZE_MD} />,
  other: <Coins className={ICON_SIZE_MD} />,
};

// Calendar filter icons
export const CALENDAR_FILTER_ICONS: Record<string, React.ReactNode> = {
  birthdays: <Cake className={ICON_SIZE_SM} />,
  events: <CalendarDays className={ICON_SIZE_SM} />,
  holidays: <Flag className={ICON_SIZE_SM} />,
  cashflow: <BadgeDollarSign className={ICON_SIZE_SM} />,
  investments: <TrendingUp className={ICON_SIZE_SM} />,
  projects: <FolderKanban className={ICON_SIZE_SM} />,
  tasks: <CheckSquare className={ICON_SIZE_SM} />,
};

// Category icons (Lucide-based, replacing emojis)
export const CATEGORY_ICON_MAP: Record<string, React.ReactNode> = {
  briefcase: <Briefcase className={ICON_SIZE_MD} />,
  home: <Home className={ICON_SIZE_MD} />,
  car: <Car className={ICON_SIZE_MD} />,
  utensils: <Utensils className={ICON_SIZE_MD} />,
  pill: <Pill className={ICON_SIZE_MD} />,
  book: <BookOpen className={ICON_SIZE_MD} />,
  gamepad: <Gamepad2 className={ICON_SIZE_MD} />,
  plane: <Plane className={ICON_SIZE_MD} />,
  cake: <Cake className={ICON_SIZE_MD} />,
  dollar: <BadgeDollarSign className={ICON_SIZE_MD} />,
  chart: <BarChart3 className={ICON_SIZE_MD} />,
  cart: <ShoppingCart className={ICON_SIZE_MD} />,
  target: <Target className={ICON_SIZE_MD} />,
  zap: <Zap className={ICON_SIZE_MD} />,
  wrench: <Wrench className={ICON_SIZE_MD} />,
  phone: <Smartphone className={ICON_SIZE_MD} />,
  music: <Music className={ICON_SIZE_MD} />,
  gym: <Dumbbell className={ICON_SIZE_MD} />,
  movie: <Clapperboard className={ICON_SIZE_MD} />,
  shirt: <Shirt className={ICON_SIZE_MD} />,
  pet: <Dog className={ICON_SIZE_MD} />,
  plant: <Sprout className={ICON_SIZE_MD} />,
  coffee: <Coffee className={ICON_SIZE_MD} />,
  gift: <Gift className={ICON_SIZE_MD} />,
};

// Ordered list of category icon keys for selectors
export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICON_MAP);

// Account type icons
export const ACCOUNT_TYPE_ICONS: Record<string, React.ReactNode> = {
  bank_account: <Landmark className={ICON_SIZE_MD} />,
  credit_card: <CreditCard className={ICON_SIZE_MD} />,
  investment: <PiggyBank className={ICON_SIZE_MD} />,
  wallet: <WalletCards className={ICON_SIZE_MD} />,
  cash: <Banknote className={ICON_SIZE_MD} />,
  crypto: <Bitcoin className={ICON_SIZE_MD} />,
};
