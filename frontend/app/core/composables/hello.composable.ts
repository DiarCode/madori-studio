import { ref } from "vue";

export const useHello = () => {
  return ref("Hello from core composable!");
};
