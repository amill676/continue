import ReactDOM from "react-dom/client";
import { MappingPanel } from "./inlet/VSCodeMappingView";

(async () => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <MappingPanel />
  );
})();

