import { redirect } from "next/navigation";

/** 根路径打开静态单页 index.html（与仓库根目录 index.html 同步到 public/index.html） */
export default function HomePage() {
  redirect("/index.html");
}
