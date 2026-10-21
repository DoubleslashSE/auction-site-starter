import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Layout } from "./components/Layout";
import { HowItWorksPage, NotFoundPage, SignedInPage, SignUpPage } from "./pages/AccountPages";
import { BrowsePage } from "./pages/BrowsePage";
import { LotPage } from "./pages/LotPage";
import { MyPages } from "./pages/MyPages";
import { SellPage } from "./pages/SellPage";
import { SiteProvider } from "./site";
import "./theme.css";
import "./styles.css";

const router = createBrowserRouter([
  // The sign-in callback finishes before the site loads anything as the person.
  { path: "/signed-in", element: <SignedInPage /> },
  {
    element: (
      <SiteProvider>
        <Layout />
      </SiteProvider>
    ),
    children: [
      { index: true, element: <BrowsePage /> },
      { path: "lots/:id", element: <LotPage /> },
      { path: "lots/:id/edit", element: <SellPage /> },
      { path: "sell", element: <SellPage /> },
      { path: "my", element: <MyPages /> },
      { path: "my/:tab", element: <MyPages /> },
      { path: "sign-up", element: <SignUpPage /> },
      { path: "how-it-works", element: <HowItWorksPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element.");

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
