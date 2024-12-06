import ReactDOM from "react-dom/client";
import { VSCodeInspectView } from "./inlet/VSCodeInspectView";

(async () => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <VSCodeInspectView />
  );
})();
