import fs from "fs";
import dotenv from "dotenv";
import { chromium, Browser, Page, ElementHandle } from "playwright"
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getCredential = (): [string, string] => {
  dotenv.config();
  const email = process.env.EMAIL;
  if (!email) throw "Email is required.";
  const password = process.env.PASSWORD;
  if (!password) throw "Password is required.";
  return [email, password];
};

export const getBlogIds = (): string[] => {
  const data = fs.readFileSync("blogs.txt");
  const blogs = data.toString().split("\n");
  return blogs;
};

export const getBrowser = async (): Promise<Browser> => {
  const browser = await chromium.launch()
  return browser;
};

const getBlogData = async (page: Page, id: string) => {
  let blog = await prisma.blog.findUnique({ where: { id } });
  if (!blog) {
    const title = await page.$eval("#blog_title_only", (e) =>
      e.textContent?.trim()
    );
    if (!title) throw "タイトルを取得できませんでした。";
    blog = await prisma.blog.create({ data: { id, title } });
  }
  console.log(`  タイトル: ${blog.title}`);
  if (!blog) throw "ブログを取得できませんでした。";
  await getArticlesData(page, id);
};

const getArticlesData = async (page: Page, blogId: string) => {
  const base_url = page.url()
  console.log(`  URL: ${base_url}`)
  console.log("  記事URLリストの取得を開始");
  const total_pages = +(await ((await page.waitForSelector(".page_all")) as ElementHandle<HTMLElement>).textContent() as string);
  for (let i = 1; i <= total_pages; i++) {
    await page.goto(`${base_url}?page=${i}`)
    console.log(`  ページ${i}/${total_pages}取得中`)
    await page.locator(".page_no").waitFor();
    const newUrls = await page.$$eval("#blog_list>li.detail span.cmt_icon+a", aTags=>aTags.map(aTag=>{
      return aTag.getAttribute("href") as string
    }));
     await getArticleData(page, newUrls, blogId)
  }
  console.log(`  ${blogId}の取得完了`)
};

const getArticleData = async (page: Page, urls: string[], blogId: string) => {
  for(const url of urls) {
    await page.goto(`https://ch.nicovideo.jp${url}`)
    console.log(
      `    https://ch.nicovideo.jp${url} の記事を取得中`
    );
    const id = url.split("/").slice(-1)[0]
    if(await prisma.article.findUnique({where: {
      id
    }})){
      continue
    }
    const title = await (await page.waitForSelector("#article_blog_title")).textContent() as string;
    console.log(`      Title: ${title}`)
    const content = await (await page.waitForSelector(".main_blog_txt")).innerHTML() as string;
    console.log(`      Content(文字数): ${content.length}`);
    const publishedAt = new Date((await (await page.waitForSelector(".article_blog_data_first>span")).textContent() as string).trim());
    console.log(`      Published At: ${publishedAt}`);
    const purchase_btn = await page.$("#main_pay_title > .members_only");
    if(purchase_btn) {
      continue
    }
    await prisma.article.create({data: {
      id, blogId, title, content, publishedAt
    }})
  }
};

const main = async () => {
  const browser = await getBrowser();
  try {
    const page = await browser.newPage();
    const [email, password] = getCredential();
    const blogIds = getBlogIds();

    // ログイン
    console.log("ログインページに移動");
    await page.goto("https://account.nicovideo.jp/login");
    console.log("ログインページを取得");
    await page.type("#input__mailtel", email)
    await page.type("#input__password", password);
    await page.keyboard.press("Enter");
    console.log("ログイン");
    await page.waitForSelector("h1.NiconicoLogo");
    console.log("ログイン完了");

    for (const blogId of blogIds) {
      console.log(`\n${blogId}の取得を開始`);
      await page.goto(`https://ch.nicovideo.jp/${blogId}/blomaga`);
      console.log("  ブロマガページの読み込み待ち");
      await page.waitForSelector("button.next_page_btn");
      console.log("  読み込み完了");
      await getBlogData(page, blogId);
    }
  } catch (e) {
  } finally {
    browser.close();
  }
};

try {
  main();
} catch (e) {
  console.error(e);
}
