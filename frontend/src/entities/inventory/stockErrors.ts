export function getStockErrorMessage(code?: string | null) {
  switch (code) {
    case 'OUT_OF_STOCK':
      return 'На складе недостаточно доступного товара для резерва.';
    case 'STOCK_CONFLICT':
      return 'Остатки изменились во время операции. Обновите данные и проверьте остатки.';
  }
}
