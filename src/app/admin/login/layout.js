// Staff sign-in is not for search results (it is also blocked in robots.txt).
export const metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }) {
  return children;
}
