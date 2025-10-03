// Data Source Adapter Interface
export interface DataAdapter {
  getData(): Promise<any>;
}

export interface DataSourceConfig {
  type: string;
  path: string;
}
