import HomeClient from '@/components/HomeClient';
import HomeSeo from '@/components/HomeSeo';

// Title, description, social tags and robots rules come from the root layout; this page adds its own canonical address.
export const metadata = { alternates: { canonical: '/' } };

export default function Page() {
  return <HomeClient seo={<HomeSeo />} />;
}
