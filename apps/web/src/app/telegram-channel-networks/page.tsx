import { redirect } from "next/navigation";

export default function TelegramChannelNetworksPage() {
  redirect("/telegram-channels?tab=networks");
}
