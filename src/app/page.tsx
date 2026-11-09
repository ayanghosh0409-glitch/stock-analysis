import data from "../../data/stocks.json";
import Dashboard from "@/components/Dashboard";
import type { Dataset } from "@/lib/types";

export default function Home() {
  return <Dashboard data={data as Dataset} />;
}
