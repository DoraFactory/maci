import { Footer, Layout, Navbar } from 'nextra-theme-docs';
import { Head } from 'nextra/components';
import { getPageMap } from 'nextra/page-map';
import '../globals.css';
import { Metadata } from 'next';
import { NextraSearchDialog } from '@/components/nextra-search-dialog';
import { getPagesFromPageMap } from '@/lib/getPagesFromPageMap';

export const metadata: Metadata = {
  // Define your metadata here
  // For more information on metadata API, see: https://nextjs.org/docs/app/building-your-application/optimizing/metadata
};

export function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'zh' }];
}

const navbar = (
  <Navbar
    projectLink="https://github.com/DoraFactory/maci"
    logo={<img src="/images/general/logo.svg" alt="Logo" width={100} height={20} />}
    // ... Your additional navbar options
  />
);
const footer = <Footer>MIT {new Date().getFullYear()} © Dora Factory.</Footer>;

export default async function RootLayout({ children, params }) {
  const { locale } = await params;
  // Get full pageMap and extract the locale-specific docs
  const allPageMaps = await getPageMap();

  // Find locale folder -> docs folder
  const localeFolder = allPageMaps.find((item: any) => item.name === locale);
  const docsFolder =
    localeFolder && 'children' in localeFolder
      ? localeFolder.children?.find((item: any) => item.name === 'docs')
      : null;

  // Use docs folder's children as pageMap for sidebar
  const pageMap = docsFolder && 'children' in docsFolder ? docsFolder.children : allPageMaps;

  const pages = await getPagesFromPageMap({
    pageMapArray: pageMap
    // modify page data if needed
    // filterItem: async (item) => {
    //     return {
    //         ...item,
    //     };
    // }
  });

  return (
    <html
      // Not required, but good for SEO
      lang={locale || 'en'}
      // Required to be set
      dir="ltr"
      // Suggested by `next-themes` package https://github.com/pacocoursey/next-themes#with-app
      suppressHydrationWarning
    >
      <Head
      // ... Your additional head options
      >
        <link rel="shortcut icon" href="/images/general/icon.svg" />
        {/* Your additional tags should be passed as `children` of `<Head>` element */}
      </Head>
      <body>
        <Layout
          // banner={banner}
          navbar={navbar}
          pageMap={pageMap}
          sidebar={{ defaultOpen: true }}
          docsRepositoryBase="https://github.com/DoraFactory/maci/tree/main/docs"
          footer={footer}
          search={<NextraSearchDialog pages={pages} />}
          i18n={[
            { locale: 'en', name: 'English' },
            { locale: 'zh', name: '简体中文' }
          ]}
          // ... Your additional layout options
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
